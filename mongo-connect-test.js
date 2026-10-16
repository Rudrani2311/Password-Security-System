const { connectDatabase, getDatabase } = require("./mongo");

async function test() {
    try {
        await connectDatabase();

        const db = getDatabase();

        const user = await db.collection("users").findOne({
            username: "testuser"
        });

        console.log("Application database connection successful.");
        console.log("User found:", user.username);
    } catch (error) {
        console.log("Database connection failed.");
        console.log(error.message);
    }
}

test();