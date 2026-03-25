require("dotenv").config();
const { Database } = require("utils-heidi");
const tables = require("../constants/tableNames");

const db = new Database(
    process.env.DATABASE_HOST,
    process.env.DATABASE_USER,
    process.env.DATABASE_PASSWORD,
    process.env.DATABASE_NAME,
    process.env.DATABASE_PORT
  );

async function createNewMediaUser(mediaUserName, accountWebsite, metadata){
    console.log(`Creating new media user: ${mediaUserName} `);
    // Create new user Account
    let insertionData_user;
    try {
        insertionData_user = {
            firstname: "Scraper",
            lastname: mediaUserName,
            roleId: 3,
            username:
                mediaUserName +
                "_" +
                String(Math.floor(Math.random() * (999 - 100 + 1) + 100)),
            email: "ki_" +mediaUserName+ "@heidi-app.de",
            emailVerified: true,
            website: accountWebsite,
            };
        const responseGetCoreUser = await db.get(tables.USER_TABLE, null, [{key: "email", value: insertionData_user.email, sign: "="}])
        if(responseGetCoreUser && responseGetCoreUser.rows.length > 0) {
            throw new Error(`Error creatinga a new user: User Already Exists with this email`)
        } else {
            const responseCoreUserTable = await db.create(
                tables.USER_TABLE,
                null,
                insertionData_user
            );
            metadata.userId = responseCoreUserTable.id
            await db.update(tables.MEDIA_ACCOUNT, null,
                { metadata: JSON.stringify(metadata) },
                { username: mediaUserName }
            )
            return responseCoreUserTable.id;
        }

    } catch (error) {
        throw new Error(`Error creatinga a new user: ${error}`)
    }
}

module.exports = { createNewMediaUser }