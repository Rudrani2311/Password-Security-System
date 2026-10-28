require("dotenv").config();
const { ObjectId } = require("mongodb");
const { connectDatabase, getDatabase } = require("./mongo");

async function main() {
    await connectDatabase();

    const db = getDatabase();

    const result = await db.collection("users").updateOne(
        { username: "testuser" },
        { $set: { password_expiry_date: new Date(Date.now() - 60 * 1000) } }
    );

    if (result.matchedCount === 0) {
        console.log("User not found.");
        return;
    }

    console.log("Password expiry set to the past.");
}

main().catch(error => {
    console.error(error);
});