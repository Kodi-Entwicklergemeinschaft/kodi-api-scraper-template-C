require("dotenv").config();
const { Database } = require("utils-heidi");
const tables = require("../constants/tableNames");
const { createTimestamp } = require("./dateParser");
const { createNewMediaUser } = require("./createNewMediaUser");
const { addDefaultImage } = require("./addDefaultImage");

const db = new Database(
    process.env.DATABASE_HOST,
    process.env.DATABASE_USER,
    process.env.DATABASE_PASSWORD,
    process.env.DATABASE_NAME,
    process.env.DATABASE_PORT
);

function convertDateToDDMMYYYY(dateString) {
    const mmddRegex = /^(0[1-9]|1[0-2])\/([0-2][0-9]|3[01])$/;

    if (mmddRegex.test(dateString)) {
        const [month, day] = dateString.split("/");
        const currentYear = new Date().getFullYear();
        const convertedDate = `${day}.${month}.${currentYear}`;

        return convertedDate;
    } else {
        return dateString;
    }
}

async function eventsCategoryFilter(listing) {
    try {
        if (listing.endDate) {
            listing.expiryDate = listing.endDate
        } else {
            listing.expiryDate = listing.startDate;
        }

    } catch (error) {
        throw new Error("Invalid date format", 400);
    }
    return listing;
}

async function essenOrPOICategoryFilter(listing) {
    const today = new Date();
    let startDate;
    if (!listing.startDate || listing.startDate === "Heute" || listing.startDate === "") {
        listing.startDate = `${today.getDate().toString().padStart(2, "0")}.${(
            today.getMonth() + 1
        )
            .toString()
            .padStart(2, "0")}.${today.getFullYear()}`;
        startDate = listing.startDate;
        listing.startDate = createTimestamp(
            listing.startDate,
            listing.startTime
        );
    } else {
        listing.startDate = createTimestamp(
            listing.startDate,
            listing.startTime
        );
    }
    // Convert endDate if present to MySQL-friendly timestamp as well
    if (listing.endDate && listing.endDate !== "") {
        listing.endDate = createTimestamp(
            listing.endDate,
            listing.endTime
        );
    } else {
        listing.endDate = null;
    }
    listing.expiryDate = listing.endDate || null;
    return listing;
}

async function parseData(
    listing,
    cityUserId,
    showExternal,
    metadata,
    categoryId
) {
    if (!listing.title || listing.title === "") {
        return null;
    }
    // if (!listing.link || listing.link === "") {
    //     return null;
    // }
    if (!listing.description || listing.description === "") {
        listing.description = listing.title;
    }
    let date = new Date();
    if (listing.date) {
        const checkDate = createTimestamp(listing.date);
        if (checkDate) {
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
            const checkDateObj = new Date(checkDate);

            if (checkDateObj >= twoDaysAgo) {
                listing.createdAt = date.toISOString().slice(0, 10); // if the listing is new, assigning it the current date
            } else {
                return null; // if the listing is older than 2 days, ignoring it.
            }
        } else {
            listing.createdAt = date.toISOString().slice(0, 10); // if the reformatDate function couldn't identify the date format, then assigning it the current date.,
        }
    } else {
        listing.createdAt = date.toISOString().slice(0, 10); // if there is no date, then assigning it the current date
    }
    let createdAtDate = new Date(listing.createdAt);
    createdAtDate.setDate(createdAtDate.getDate() + 14);
    if (!listing.startDate) {
        listing.startDate = null;
    }
    if (categoryId !== 3) {
        listing.expiryDate = createdAtDate.toISOString().split("T")[0];
    }
    if (!listing.endDate) {
        listing.endDate = null;
    }
    if (categoryId === 3) {
        try {
            listing = await eventsCategoryFilter(listing);
            if (listing === null) {
                return null;
            }
        } catch (error) {
            // console logging to see the invalid listings in the logs
            console.log(`invalid date format for listing: ${listing.link}`);
            return null;
        }
    } else if (categoryId === 13 || categoryId === 21) {
        // eatOrDrink or Highlights Category
        try {
            listing = await essenOrPOICategoryFilter(listing);
        } catch (err) {
            console.log("Date creation went wrong", err);
            return null;
        }
    }
    // Preserve the original link for externalId even if website is hidden later
    const originalLink = listing.link;
    let resolvedWebsite = null;
    if (
        metadata.accountWebsite.startsWith(
            "https://www.presseportal.de/blaulicht/r"
        )
    ) {
        // to stop ads from presseportal
        if (
            !listing.link.startsWith("https://www.presseportal.de/blaulicht/")
        ) {
            return null;
        } else {
            resolvedWebsite = listing.link;
        }
    } else {
        resolvedWebsite = listing.link;
    }
    listing.website = metadata.hideUrl ? null : resolvedWebsite;
    listing.id = null;
    listing.userId = cityUserId;
    listing.statusId = 1;
    listing.villageId = null;
    listing.sourceId = 3; // WebScrapper
    // keep externalId even when website is hidden
    listing.externalId = originalLink || resolvedWebsite;
    listing.categoryId = metadata.categoryId;
    if (metadata.subcategoryId) listing.subcategoryId = metadata.subcategoryId;
    else listing.subcategoryId = null;
    if (listing.image) {
        // Check if the logo is from the img.ecmaps.de/remote/.jpg? domain
        const isEcmapsDomain = listing.image.startsWith(
            "img.ecmaps.de/remote/.jpg?"
        );

        if (isEcmapsDomain) {
            // Extract the `url` parameter from the image URL, if it exists
            const queryString = listing.image.split("?")[1];

            if (queryString) {
                const urlParams = new URLSearchParams(queryString);
                const extractedUrl = urlParams.get("url");

                if (extractedUrl) {
                    const decodedUrl = decodeURIComponent(extractedUrl);

                    // Check if the decoded URL is a valid URL
                    let isValidUrl = false;
                    try {
                        new URL(decodedUrl);
                        isValidUrl = true;
                    } catch (e) {
                        isValidUrl = false;
                    }

                    // If the URL is not valid, set the logo to the default image
                    listing.logo = isValidUrl
                        ? decodedUrl
                        : process.env.REACT_APP_BUCKET_HOST +
                          addDefaultImage(listing.categoryId);
                }
            }
        } else {
            listing.logo = listing.image;
        }
    } else {
        listing.logo =
            process.env.REACT_APP_BUCKET_HOST +
            addDefaultImage(listing.categoryId);
    }
    listing.showExternal = showExternal ? showExternal : false;
    if (listing.location) {
        listing.place = listing.location;
    } else {
        listing.place = null;
    }
    if (!listing.address) {
        listing.address = null;
    }
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const expiryDate = new Date(listing.expiryDate);
    if (expiryDate < todayMidnight) {
        listing.statusId = 2; // Set statusId to 2 if the expiry date is in the past
    }
    delete listing.location;
    delete listing.link;
    delete listing.date;
    delete listing.image;
    return listing;
}

async function createTemporaryTable(updatedListings, cityId) {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const tableName = `temp_listings_${currentTimestamp}`;
    let queryCreateTable = `CREATE TABLE IF NOT EXISTS ${tableName} (
        id INT,
        title VARCHAR(255),
        description TEXT,
        createdAt DATETIME,
        startDate DATETIME,
        website TEXT,
        userId INT,
        expiryDate DATETIME,
        endDate DATETIME,
        statusId INT,
        villageId INT,
        sourceId INT,
        logo VARCHAR(1000),
        externalId TEXT,
        categoryId INT,
        subcategoryId INT,
        showExternal boolean,
        place varchar(255),
        address varchar(255),
        longitude DOUBLE,
        latitude DOUBLE,
        UNIQUE (externalId(767))
    );`;
    let insertQuery = `INSERT INTO ${tableName} (title, description, createdAt, startDate, expiryDate, endDate, website, id, userId, statusId, sourceId, externalId, categoryId, subcategoryId, logo, showExternal, place, address, latitude, longitude) VALUES ?`;
    try {
        await db.callQuery(queryCreateTable, null);
        const sqlListings = updatedListings.map((post) => [
            post.title,
            post.description,
            post.createdAt,
            post.startDate,
            post.expiryDate,
            post.endDate,
            post.website,
            post.id,
            post.userId,
            post.statusId,
            post.sourceId,
            post.externalId,
            post.categoryId,
            post.subcategoryId,
            post.logo,
            post.showExternal,
            post.place,
            post.address,
            post.latitude,
            post.longitude
        ]);
        await db.callQuery(insertQuery, [sqlListings]);
        return tableName;
    } catch (error) {
        let query = `DROP TABLE IF EXISTS ${tableName};`;
        await db.callQuery(query);
        throw new Error(`Error creating temporary table: ${error}`);
    }
}

async function getCityUserId(coreUserId, cityId) {
    let cityUserId;
    try {
        const responseCoreUserTable = await db.get(
            tables.USER_TABLE,
            null,
            [{ key: "id", value: coreUserId, sign: "=" }],
            undefined,
            [
                "username",
                "firstname",
                "lastname",
                "email",
                "phoneNumber",
                "image",
                "description",
                "website",
                "roleId"
            ]
        );
        const data = responseCoreUserTable.rows;
        if (data && data.length === 0) {
            throw new Error(`Invalid User '${coreUserId}' given`);
        }
        let user = data[0];
        const responseCityUserMapping = await db.get(
            tables.USER_CITYUSER_MAPPING_TABLE,
            null,
            [
                { key: "cityId", value: cityId, sign: "=" },
                { key: "userId", value: coreUserId, sign: "=" }
            ]
        );
        if (
            !responseCityUserMapping.rows ||
            responseCityUserMapping.rows.length === 0
        ) {
            let responseCityUserTable = await db.get(
                tables.USER_TABLE,
                cityId,
                [{ key: "username", value: user.username, sign: "=" }]
            );
            if (
                !responseCityUserTable.rows ||
                responseCityUserTable.rows.length === 0
            ) {
                responseCityUserTable = await db.create(
                    tables.USER_TABLE,
                    cityId,
                    user
                );
                cityUserId = responseCityUserTable.id;
            } else {
                cityUserId = responseCityUserTable.rows[0].id;
            }
            await db.create(tables.USER_CITYUSER_MAPPING_TABLE, null, {
                cityId,
                userId: coreUserId,
                cityUserId
            });
        } else {
            cityUserId = responseCityUserMapping.rows[0].cityUserId;
        }
        return cityUserId;
    } catch (error) {
        throw new Error(`Error creating cityUserId: ${error}`);
    }
}
module.exports = {
    parseData,
    createNewMediaUser,
    createTemporaryTable,
    getCityUserId
};
