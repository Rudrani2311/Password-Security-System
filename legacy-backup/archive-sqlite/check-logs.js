const db = require("./database");

const logs = db.prepare(`
    SELECT 
        security_logs.id,
        users.username,
        security_logs.event_type,
        security_logs.timestamp
    FROM security_logs
    JOIN users ON security_logs.user_id = users.id
    ORDER BY security_logs.id DESC
`);

console.log(logs.all());