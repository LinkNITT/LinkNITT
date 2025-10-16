// index.js — LinkNITT backend + static frontend
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import neo4j from "neo4j-driver";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Config
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "change_this";
const SEED_SECRET = process.env.SEED_SECRET || "seed_secret_default";

// Neo4j driver (uses Aura URI)
if (!process.env.NEO4J_URI) {
  console.error("NEO4J_URI not set in secrets — set it and restart Repl.");
  process.exit(1);
}
const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

// helper: run cypher with fresh session
async function runCypher(cypher, params = {}) {
  const session = driver.session();
  try {
    return await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

/* ---------------------
   API ROUTES
   --------------------- */

// Root -> serve frontend index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---- Auth ----
app.post("/register", async (req, res) => {
  const { name, email, password, role, dept } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: "Missing fields" });
  try {
    const hashed = await bcrypt.hash(password, 10);
    await runCypher(
      `MERGE (u:User {email:$email})
       SET u.name=$name, u.password=$hashed, u.role=$role, u.dept=$dept
       RETURN u`,
      { name, email, hashed, role, dept: dept || null }
    );
    res.json({ message: "User registered successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });
  try {
    const result = await runCypher(`MATCH (u:User {email:$email}) RETURN u`, { email });
    if (result.records.length === 0) return res.status(404).json({ error: "User not found" });
    const u = result.records[0].get("u").properties;
    const ok = await bcrypt.compare(password, u.password);
    if (!ok) return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign({ email: u.email, role: u.role, name: u.name, dept: u.dept || null }, JWT_SECRET, { expiresIn: "4h" });
    res.json({ token, user: { name: u.name, email: u.email, role: u.role, dept: u.dept || null } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// JWT middleware
function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(403).json({ error: "No token" });
  const token = header.split(" ")[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Invalid token" });
    req.user = decoded;
    next();
  });
}

// ---- Items ----
// Add item (Faculty)
app.post("/items", verifyToken, async (req, res) => {
  if (req.user.role !== "Faculty") return res.status(403).json({ error: "Only Faculty can add items" });
  const { item } = req.body;
  try {
    await runCypher(
      `MATCH (u:User {email:$email})
       MERGE (i:Item {name:$item})
       MERGE (u)-[:SELLS]->(i)`,
      { email: req.user.email, item }
    );
    res.json({ message: "Item added" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Add item failed" });
  }
});

// Get items
app.get("/items", async (req, res) => {
  try {
    const r = await runCypher(`MATCH (u:User)-[:SELLS]->(i:Item) RETURN DISTINCT u.name AS seller, i.name AS item LIMIT 200`);
    const items = r.records.map(rec => ({ seller: rec.get("seller"), item: rec.get("item") }));
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Get items failed" });
  }
});

// Student buys an item
app.post("/buy", verifyToken, async (req, res) => {
  if (req.user.role !== "Student") return res.status(403).json({ error: "Only Students can buy" });
  const { item } = req.body;
  try {
    await runCypher(
      `MATCH (u:User {email:$email}), (i:Item {name:$item})
       MERGE (u)-[:BOUGHT]->(i)`,
      { email: req.user.email, item }
    );
    res.json({ message: "Item bought" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Buy failed" });
  }
});

// ---- Jobs ----
// Post job (Faculty)
app.post("/jobs", verifyToken, async (req, res) => {
  if (req.user.role !== "Faculty") return res.status(403).json({ error: "Only Faculty can post jobs" });
  const { title, desc } = req.body;
  try {
    await runCypher(
      `MATCH (u:User {email:$email})
       CREATE (j:Job {title:$title, desc:$desc, postedAt: datetime()})
       CREATE (u)-[:POSTED]->(j)`,
      { email: req.user.email, title, desc }
    );
    res.json({ message: "Job posted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Post job failed" });
  }
});

// Get jobs
app.get("/jobs", async (req, res) => {
  try {
    const r = await runCypher(
      `MATCH (u:User)-[:POSTED]->(j:Job) RETURN j.title AS title, j.desc AS desc, u.name AS poster, j.postedAt AS postedAt ORDER BY j.postedAt DESC LIMIT 200`
    );
    const jobs = r.records.map(rec => ({
      title: rec.get("title"), desc: rec.get("desc"), poster: rec.get("poster"), postedAt: rec.get("postedAt") ? rec.get("postedAt").toString() : null
    }));
    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Get jobs failed" });
  }
});

// Student applies to job
app.post("/jobs/apply", verifyToken, async (req, res) => {
  if (req.user.role !== "Student") return res.status(403).json({ error: "Only Students can apply" });
  const { title } = req.body;
  try {
    await runCypher(
      `MATCH (s:User {email:$email}), (j:Job {title:$title})
       MERGE (s)-[:APPLIES {appliedAt: datetime()}]->(j)`,
      { email: req.user.email, title }
    );
    res.json({ message: "Applied to job" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Apply failed" });
  }
});

// ---- Mentorship ----
// Faculty offers mentorship
app.post("/mentors/offer", verifyToken, async (req, res) => {
  if (req.user.role !== "Faculty") return res.status(403).json({ error: "Only Faculty can offer mentorship" });
  const { topic, note, capacity } = req.body;
  try {
    await runCypher(
      `MATCH (f:User {email:$email})
       CREATE (m:Mentorship {topic:$topic, note:$note, capacity:$capacity})
       CREATE (f)-[:MENTORS]->(m)`,
      { email: req.user.email, topic, note, capacity: Number(capacity || 1) }
    );
    res.json({ message: "Mentorship offered" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Offer failed" });
  }
});

// Student requests mentorship from a faculty
app.post("/mentors/request", verifyToken, async (req, res) => {
  if (req.user.role !== "Student") return res.status(403).json({ error: "Only Students can request mentorship" });
  const { facultyEmail, topic } = req.body;
  try {
    await runCypher(
      `MATCH (s:User {email:$studentEmail}), (f:User {email:$facultyEmail})
       MERGE (s)-[:REQUESTS_MENTORSHIP {when: datetime(), topic:$topic}]->(f)`,
      { studentEmail: req.user.email, facultyEmail, topic }
    );
    res.json({ message: "Mentorship requested" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Request failed" });
  }
});

// Get mentors
app.get("/mentors", async (req, res) => {
  try {
    const r = await runCypher(
      `MATCH (f:User {role:'Faculty'})
       OPTIONAL MATCH (f)-[:MENTORS]->(m:Mentorship)
       RETURN f.name AS name, f.email AS email, collect(m.topic) AS topics, collect(m.note) AS notes LIMIT 200`
    );
    const mentors = r.records.map(rec => ({
      name: rec.get("name"), email: rec.get("email"), topics: rec.get("topics") || [], notes: rec.get("notes") || []
    }));
    res.json(mentors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Get mentors failed" });
  }
});

// ---- Recommendations ----
app.get("/recommend", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;

    // 1) Try co-buy (use COALESCE to accept different property names)
    const itemsR = await runCypher(
      `MATCH (u:User {email:$email})-[:BOUGHT]->(i:Item)<-[:BOUGHT]-(other:User)-[:BOUGHT]->(rec:Item)
       WHERE NOT (u)-[:BOUGHT]->(rec)
       RETURN DISTINCT COALESCE(rec.name, rec.item, rec.title) AS recommendation
       LIMIT 6`,
      { email }
    );
    let itemRecs = itemsR.records.map(r => r.get("recommendation")).filter(Boolean);

    // 2) If no co-buy recs, fall back to popular items (top bought items)
    if (!itemRecs || itemRecs.length === 0) {
      const popularR = await runCypher(
        `MATCH (buyer:User)-[:BOUGHT]->(itm:Item)
         RETURN COALESCE(itm.name, itm.item, itm.title) AS recommendation, COUNT(buyer) AS cnt
         ORDER BY cnt DESC
         LIMIT 6`
      );
      itemRecs = popularR.records.map(r => r.get("recommendation")).filter(Boolean);
    }

    // mentors in same dept
    const mentorsR = await runCypher(
      `MATCH (u:User {email:$email})
       OPTIONAL MATCH (f:User {role:'Faculty'}) WHERE f.dept = u.dept
       RETURN DISTINCT f.name AS mentor LIMIT 6`, { email }
    );
    const mentorRecs = mentorsR.records.map(r => r.get("mentor")).filter(Boolean);

    // jobs in same dept
    const jobsR = await runCypher(
      `MATCH (u:User {email:$email})
       MATCH (f:User)-[:POSTED]->(j:Job)
       WHERE f.dept = u.dept OR (u)-[:CONNECTED_WITH]-(f)
       RETURN DISTINCT j.title AS job LIMIT 6`, { email }
    );
    const jobRecs = jobsR.records.map(r => r.get("job"));

    res.json({ items: itemRecs, mentors: mentorRecs, jobs: jobRecs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Recommend failed" });
  }
});


// ---- Utility: list users ----
app.get("/users", async (req, res) => {
  try {
    const r = await runCypher(`MATCH (u:User) RETURN u.name AS name, u.email AS email, u.role AS role, u.dept AS dept LIMIT 200`);
    res.json(r.records.map(rec => ({ name: rec.get("name"), email: rec.get("email"), role: rec.get("role"), dept: rec.get("dept") })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Get users failed" });
  }
});

// ---- Seed endpoint (protected by SEED_SECRET) ----
app.get("/seed", async (req, res) => {
  const secret = req.query.secret;
  if (secret !== SEED_SECRET) return res.status(403).json({ error: "Forbidden" });

  try {
    await runCypher(`MATCH (n) DETACH DELETE n`);
    // create sample users, items, jobs, mentors
    await runCypher(`CREATE (:User {name:'Dr. Meena', email:'meena@nitt.edu', role:'Faculty', dept:'CSE', password:'x'})`);
    await runCypher(`CREATE (:User {name:'Priya', email:'priya@nitt.edu', role:'Student', dept:'CSE', password:'x'})`);
    await runCypher(`CREATE (:Item {name:'Algorithms Textbook'})`);
    await runCypher(`MATCH (f:User {name:'Dr. Meena'}), (i:Item {name:'Algorithms Textbook'}) CREATE (f)-[:SELLS]->(i)`);
    await runCypher(`CREATE (j:Job {title:'Club Design Project', desc:'Design UI for robotics club', postedAt: datetime()})`);
    await runCypher(`MATCH (f:User {name:'Dr. Meena'}), (j:Job {title:'Club Design Project'}) CREATE (f)-[:POSTED]->(j)`);
    await runCypher(`MATCH (p:User {name:'Priya'}), (j:Job {title:'Club Design Project'}) CREATE (p)-[:APPLIES]->(j)`);
    res.json({ message: "Seeded demo data" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Seed failed" });
  }
});

/* ------------- Serve frontend static files ------------- */
app.use(express.static(path.join(__dirname, "public")));

// If route not matched by API and a file doesn't exist, serve index.html (SPA)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Shutdown
process.on("SIGINT", async () => {
  try { await driver.close(); } catch (e) {}
  process.exit(0);
});

// Start
app.listen(PORT, () => console.log(`✅ LinkNITT running on port${PORT}\n http://localhost:5000/`))
// console.log(` ${PORT}`)