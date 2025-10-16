// seed_restore.js
import neo4j from "neo4j-driver";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

const URI = process.env.NEO4J_URI;
const USER = process.env.NEO4J_USER || process.env.NEO4J_USERNAME;
const PASS = process.env.NEO4J_PASSWORD;

if (!URI || !USER || !PASS) {
  console.error("ERROR: Missing NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD in env/secrets.");
  process.exit(1);
}

const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASS));

async function run() {
  const session = driver.session();
  try {
    console.log("🌱 Clearing database...");
    await session.run("MATCH (n) DETACH DELETE n");

    // users to create (all passwords set to 'x' for demo, but stored hashed)
    const users = [
      { name: "Dr. Meena", email: "meena@nitt.edu", role: "Faculty", dept: "CSE", password: "x" },
      { name: "Prof. Kumar", email: "kumar@nitt.edu", role: "Faculty", dept: "ECE", password: "x" },
      { name: "Priya", email: "priya@nitt.edu", role: "Student", dept: "ECE", password: "x" },
      { name: "Arjun", email: "arjun@nitt.edu", role: "Student", dept: "CSE", password: "x" },
      { name: "Rahul", email: "rahul@nitt.edu", role: "Alumni", dept: "CSE", password: "x" },
      { name: "Anita", email: "anita@nitt.edu", role: "Staff", dept: "CSE", password: "x" }
    ];

    console.log("🧩 Creating users (with hashed passwords)...");
    for (const u of users) {
      const hashed = await bcrypt.hash(u.password, 10);
      await session.run(
        `CREATE (p:User {
           name: $name, email: $email, role: $role, dept: $dept, password: $password
         })`,
        { name: u.name, email: u.email, role: u.role, dept: u.dept, password: hashed }
      );
    }

    console.log("📦 Creating items (dual properties: name & item)...");
    // create items - we set both `name` and `item` properties, and also sellerEmail placeholder (can be overwritten)
    const items = [
      { name: "Algorithms Textbook" },
      { name: "Discrete Math Book" },
      { name: "Homemade Cake" },
      { name: "Samosa Pack" }
    ];
    for (const it of items) {
      await session.run(
        `CREATE (i:Item { name:$name, item:$name, sellerEmail: null }) RETURN i`,
        { name: it.name }
      );
    }

    console.log("💼 Creating jobs...");
    const jobs = [
      { title: "Club Design Project", desc: "UI/UX and frontend for robotics club" },
      { title: "Admin Event Management", desc: "Manage event logistics for fests" }
    ];
    for (const j of jobs) {
      await session.run(`CREATE (job:Job {title:$title, desc:$desc, postedAt: datetime()})`, { title: j.title, desc: j.desc });
    }

    console.log("🔗 Creating relationships (OFFERS / SELL S / REQUESTS / POSTED)...");
    // Link items to sellers using BOTH :OFFERS and :SELLS and set sellerEmail on item nodes
    const multiOffer = async (femail, iname) => {
      await session.run(
        `MATCH (f:User {email:$femail}), (it:Item {name:$iname})
         CREATE (f)-[:OFFERS]->(it),
                (f)-[:SELLS]->(it)
         SET it.sellerEmail = $femail`,
        { femail, iname }
      );
    };

    // Dr. Meena offers/sells Algorithms Textbook and Homemade Cake
    await multiOffer("meena@nitt.edu", "Algorithms Textbook");
    await multiOffer("meena@nitt.edu", "Homemade Cake");

    // Prof Kumar offers/sells Discrete Math Book
    await multiOffer("kumar@nitt.edu", "Discrete Math Book");

    // Create some REQUESTS from students/staff (same as before)
    await session.run(
      `MATCH (s:User {email:$semail}), (it:Item {name:$iname})
       CREATE (s)-[:REQUESTS]->(it)`,
      { semail: "priya@nitt.edu", iname: "Algorithms Textbook" }
    );
    await session.run(
      `MATCH (s:User {email:$semail}), (it:Item {name:$iname})
       CREATE (s)-[:REQUESTS]->(it)`,
      { semail: "anita@nitt.edu", iname: "Homemade Cake" }
    );
    await session.run(
      `MATCH (s:User {email:$semail}), (it:Item {name:$iname})
       CREATE (s)-[:REQUESTS]->(it)`,
      { semail: "arjun@nitt.edu", iname: "Discrete Math Book" }
    );

    // Jobs: link faculty -> job via :POSTED
    await session.run(
      `MATCH (f:User {email:$femail}), (j:Job {title:$jtitle})
       CREATE (f)-[:POSTED]->(j)`,
      { femail: "meena@nitt.edu", jtitle: "Club Design Project" }
    );
    await session.run(
      `MATCH (f:User {email:$femail}), (j:Job {title:$jtitle})
       CREATE (f)-[:POSTED]->(j)`,
      { femail: "kumar@nitt.edu", jtitle: "Admin Event Management" }
    );

    // Requested job example
    await session.run(
      `MATCH (a:User {email:$aemail}), (j:Job {title:$jtitle})
       CREATE (a)-[:REQUESTS]->(j)`,
      { aemail: "rahul@nitt.edu", jtitle: "Club Design Project" }
    );

    // Add mentorship offer: Dr. Meena mentors topic 'Algorithms'
    await session.run(
      `MATCH (f:User {email:$femail})
       CREATE (m:Mentorship {topic:$topic, note:$note})
       CREATE (f)-[:MENTORS]->(m)`,
      { femail: "meena@nitt.edu", topic: "Algorithms", note: "Open for 1:1 mentoring" }
    );

    // Student requests mentorship from Dr. Meena
    await session.run(
      `MATCH (s:User {email:$semail}), (f:User {email:$femail})
       CREATE (s)-[:REQUESTS_MENTORSHIP {when: datetime(), topic:$topic}]->(f)`,
      { semail: "priya@nitt.edu", femail: "meena@nitt.edu", topic: "Algorithms" }
    );

    // Optional: connected_with edges between alumni and students
    await session.run(
      `MATCH (al:User {email:$alemail}), (st:User {email:$stemail})
       CREATE (al)-[:CONNECTED_WITH]->(st)`,
      { alemail: "rahul@nitt.edu", stemail: "arjun@nitt.edu" }
    );

    // ---------------------------
    // BUY / BOUGHT relationships
    // ---------------------------
    // Add BOUGHT relationships so recommendation (co-buy) works reliably.
    // Each BOUGHT relationship includes a timestamp and a qty property.

    console.log("🛒 Creating BOUGHT relationships for demo...");

    // Priya bought Algorithms Textbook
    await session.run(
      `MATCH (u:User {email:$uemail}), (it:Item {name:$iname})
       CREATE (u)-[:BOUGHT {when: datetime(), qty: 1}]->(it)`,
      { uemail: "priya@nitt.edu", iname: "Algorithms Textbook" }
    );

    // Arjun bought Algorithms Textbook and Discrete Math Book (helps co-buy)
    await session.run(
      `MATCH (u:User {email:$uemail}), (it1:Item {name:$iname1}), (it2:Item {name:$iname2})
       CREATE (u)-[:BOUGHT {when: datetime(), qty: 1}]->(it1),
              (u)-[:BOUGHT {when: datetime(), qty: 1}]->(it2)`,
      { uemail: "arjun@nitt.edu", iname1: "Algorithms Textbook", iname2: "Discrete Math Book" }
    );

    // Rahul bought Discrete Math Book
    await session.run(
      `MATCH (u:User {email:$uemail}), (it:Item {name:$iname})
       CREATE (u)-[:BOUGHT {when: datetime(), qty: 1}]->(it)`,
      { uemail: "rahul@nitt.edu", iname: "Discrete Math Book" }
    );

    // Anita bought Homemade Cake
    await session.run(
      `MATCH (u:User {email:$uemail}), (it:Item {name:$iname})
       CREATE (u)-[:BOUGHT {when: datetime(), qty: 2}]->(it)`,
      { uemail: "anita@nitt.edu", iname: "Homemade Cake" }
    );

    // Create demo user Riya and buys (Algorithms Textbook & Samosa Pack)
    await session.run(
      `MERGE (x:User {email:$email}) 
       ON CREATE SET x.name=$name, x.role='Student', x.dept='CSE'
       WITH x
       MATCH (a:Item {name:$i1}), (b:Item {name:$i2})
       MERGE (x)-[:BOUGHT {when: datetime(), qty: 1}]->(a)
       MERGE (x)-[:BOUGHT {when: datetime(), qty: 1}]->(b)`,
      { email: "riya@nitt.edu", name: "Riya", i1: "Algorithms Textbook", i2: "Samosa Pack" }
    );

    console.log("✅ Seed complete — users, items, jobs, mentorships, relationships, SELL S/OFFERS, and BOUGHT relations created.");

    console.log("");
    console.log("Login credentials (demo):");
    console.log(" - meena@nitt.edu  / password: x  (Faculty)");
    console.log(" - kumar@nitt.edu  / password: x  (Faculty)");
    console.log(" - priya@nitt.edu  / password: x  (Student)");
    console.log(" - arjun@nitt.edu  / password: x  (Student)");
    console.log(" - rahul@nitt.edu  / password: x  (Alumni)");
    console.log(" - anita@nitt.edu  / password: x  (Staff)");
    console.log(" - riya@nitt.edu   / password: x  (Student) — created for co-buy demo");
    console.log("");
    console.log("You can now use your existing /login endpoint with these credentials.");

  } catch (err) {
    console.error("❌ Seeding failed:", err);
  } finally {
    await session.close();
    await driver.close();
  }
}

run();
