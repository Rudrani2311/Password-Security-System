require("dotenv").config();
const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.MONGODB_URI);

let db;

async function connectDatabase() {
    await client.connect();
    db = client.db(process.env.MONGODB_DB_NAME);
    console.log("MongoDB Atlas connected.");
}

function getDatabase() {
    if (!db) {
        throw new Error("Database is not connected.");
    }

    return db;
}

module.exports = {
    connectDatabase,
    getDatabase
};