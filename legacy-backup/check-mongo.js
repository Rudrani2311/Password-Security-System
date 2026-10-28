require("dotenv").config();
const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.MONGODB_URI);

async function checkMongo() {
    try {
        await client.connect();

        const db = client.db(process.env.MONGODB_DB_NAME);

        const user = await db.collection("users").findOne({
            username: "testuser"
        });

        const history = await db.collection("password_history").find({
            user_id: user._id
        }).toArray();

        const logs = await db.collection("security_logs").find({
            user_id: user._id
        }).toArray();

        console.log("User:");
        console.log(user);

        console.log("Password history:", history.length);
        console.log("Security logs:", logs.length);

        console.log("MongoDB verification successful.");
    } catch (error) {
        console.log("Verification failed.");
        console.log(error.message);
    } finally {
        await client.close();
    }
}

checkMongo();