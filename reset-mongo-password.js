require("dotenv").config();

const bcrypt = require("bcrypt");
const { ObjectId } = require("mongodb");
const { connectDatabase, getDatabase } = require("./mongo");

async function resetMongoPassword() {
    try {
        await connectDatabase();

        const db = getDatabase();

        const newPassword = "Password1@";
        const passwordHash = await bcrypt.hash(newPassword, 12);

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);

        const result = await db.collection("users").updateOne(
            { username: "testuser" },
            {
                $set: {
                    password_hash: passwordHash,
                    password_changed_at: new Date(),
                    password_expiry_date: expiryDate
                }
            }
        );

        if (result.matchedCount === 0) {
            console.log("User testuser was not found in MongoDB.");
        } else {
            console.log("MongoDB password reset successfully.");
            console.log("Username: testuser");
            console.log("Password: Password1@");
            console.log("Password expires:", expiryDate.toISOString());
        }
    } catch (error) {
        console.error("MongoDB password reset failed.");
        console.error(error);
    }
}

resetMongoPassword();