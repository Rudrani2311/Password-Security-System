require("dotenv").config();
const { MongoClient } = require("mongodb");
const Database = require("better-sqlite3");

const mongoClient = new MongoClient(process.env.MONGODB_URI);
const sqlite = new Database("password_security.db");

async function migrate() {
    try {
        await mongoClient.connect();

        const db = mongoClient.db(process.env.MONGODB_DB_NAME);

        const usersCollection = db.collection("users");
        const historyCollection = db.collection("password_history");
        const logsCollection = db.collection("security_logs");

        const sqliteUsers = sqlite.prepare("SELECT * FROM users").all();

        for (const user of sqliteUsers) {
            const existingUser = await usersCollection.findOne({
                username: user.username
            });

            if (existingUser) {
                console.log(`User ${user.username} already exists. Skipping.`);
                continue;
            }

            const result = await usersCollection.insertOne({
                username: user.username,
                password_hash: user.password_hash,
                password_changed_at: user.password_changed_at,
                password_expiry_date: user.password_expiry_date,
                legacy_id: user.id
            });

            const mongoUserId = result.insertedId;

            const history = sqlite.prepare(`
                SELECT password_hash, created_at
                FROM password_history
                WHERE user_id = ?
            `).all(user.id);

            if (history.length > 0) {
                await historyCollection.insertMany(
                    history.map(item => ({
                        user_id: mongoUserId,
                        password_hash: item.password_hash,
                        created_at: item.created_at
                    }))
                );
            }

            const logs = sqlite.prepare(`
                SELECT event_type, timestamp
                FROM security_logs
                WHERE user_id = ?
            `).all(user.id);

            if (logs.length > 0) {
                await logsCollection.insertMany(
                    logs.map(item => ({
                        user_id: mongoUserId,
                        event_type: item.event_type,
                        timestamp: item.timestamp
                    }))
                );
            }

            console.log(`Migrated user: ${user.username}`);
            console.log(`History records: ${history.length}`);
            console.log(`Security logs: ${logs.length}`);
        }

        console.log("MongoDB migration completed successfully.");
    } catch (error) {
        console.log("Migration failed.");
        console.log(error.message);
    } finally {
        sqlite.close();
        await mongoClient.close();
    }
}

migrate();