require("dotenv").config();
const axios = require("axios");
const tables = require("./constants/tableNames");
const { Database } = require("utils-heidi");
const { createNewMediaUser } = require("./helper/createNewMediaUser");
const {
    parseData,
    createTemporaryTable,
    getCityUserId
} = require("./helper/utils");

async function fetchPage(url, username, password) {
    try {
        const response = await axios.get(url, {
            auth: { username, password },
            timeout: 10000
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching ${url}: ${error.message}`);
        throw error;
    }
}

// processData function to parse and create listings array, and remove unnecessary fields
async function processData(data, link) {
    if (!data || !Array.isArray(data)) {
        console.error("Invalid data format received.");
        return [];
    }
    try {
        const listings = data.map((item) => {
            let image = null;
            let address = null;
            let place = null;
            let longitude = null;
            let latitude = null;

            if (item?.image && item.image.length > 0)
                image = item.image[0] ? item.image[0].contentUrl : null;

            const topLevelAddressObj =
                item?.address && typeof item.address === "object"
                    ? item.address
                    : null;
            const locationAddressObj =
                item?.location && item.location.length > 0 && typeof item.location[0]?.address === "object"
                    ? item.location[0].address
                    : null;
            const addressObj = topLevelAddressObj || locationAddressObj;

            if (addressObj) {
                address = `${addressObj.streetAddress || ""}, ${
                    addressObj.postalCode || ""
                } ${addressObj.addressLocality || ""}, ${
                    addressObj.addressCountry || ""
                }`.trim();
            }

            if (item?.location && item.location.length > 0)
                place = item.location[0] ? item.location[0].name : null;

            if (item?.geo && typeof item.geo === "object") {
                longitude = item.geo.longitude ?? null;
            } else if (item?.location && item.location.length > 0) {
                longitude = item.location[0]?.geo ? item.location[0].geo.longitude : null;
            }

            if (item?.geo && typeof item.geo === "object") {
                latitude = item.geo.latitude ?? null;
            } else if (item?.location && item.location.length > 0) {
                latitude = item.location[0]?.geo ? item.location[0].geo.latitude : null;
            }

            const slug = item[`dc:slug`];

            // Derive start/end dates: prefer native fields; fallback to openingHoursSpecification[0]
            const ohs = Array.isArray(item?.openingHoursSpecification)
                ? item.openingHoursSpecification[0]
                : null;

            const computedStartDate = item.startDate || ohs?.validFrom || null;
            const computedEndDate = item.endDate || ohs?.validThrough || null;

            const computedStartTime = item.startTime || ohs?.opens || null;
            const computedEndTime = item.endTime || ohs?.closes || null;

            const listing = {
                title: item.name,
                description: item.description,
                startDate: computedStartDate,
                endDate: computedEndDate,
                startTime: computedStartTime,
                endTime: computedEndTime,
                image: image,
                place: place,
                address: address,
                longitude: longitude,
                latitude: latitude,
                link: `${link}/${slug}`
            };

            // Remove unnecessary fields
            Object.keys(listing).forEach((key) => {
                if (listing[key] === undefined || listing[key] === null) {
                    delete listing[key];
                }
            });

            return listing;
        });
        return listings;
    } catch (error) {
        console.log(error);
        throw error;
    }
}

async function scrapeAllPages(accountWebsite, username, password) {
    if (!accountWebsite || !username || !password) {
        throw new Error(
            "Invalid parameters: accountWebsite, username, and password are required."
        );
    }
    let nextLink = accountWebsite;
    let pageCount = 0;
    let listings = [];
    let response;

    while (nextLink) {
        pageCount++;
        console.log(`Fetching page ${pageCount}: ${nextLink}`);
        const payload = await fetchPage(nextLink, username, password);

        const mainSlug = payload.meta.collection.slug;
        const website = accountWebsite.split("endpoints/")[0];
        const link = `${website}endpoints/${mainSlug}`;

        // Process the payload data and push to response array
        response = await processData(payload[`@graph`], link);

        if (response && response.length > 0) {
            console.log(
                `Fetched ${response.length} listings from page ${pageCount}`
            );
            listings = listings.concat(response);
        }

        // Determine next link
        if (payload.links && payload.links.next) {
            console.log(`Next page found: ${payload.links.next}`);
            nextLink = payload.links.next;
            // nextLink = null; // For testing, set to null to stop after one page
        } else {
            nextLink = null;
            console.log("No further pages to fetch.");
        }
    }

    console.log(`Scraping complete. Total pages fetched: ${pageCount}`);
    return listings;
}

async function processInput(input, service) {
    let log = await service.startProcess(input.id);
    if (log) {
        try {
            const parsedInput = JSON.parse(input.input);
            console.log(
                `Processing input with ID: ${input.id} and content: ${input.input}`
            );
            const output = await uploadListings(parsedInput);
            await service.endProcess(log.logId, null, JSON.stringify(output));
        } catch (err) {
            console.error(err);
            await service.endProcess(log.logId, err.stack, null, true);
        } finally {
            console.log(`Got in final`);
            return true;
        }
    } else {
        return false;
    }
}

async function uploadListings(input) {
    if (!input.mediaaccount) {
        throw new Error(
            `Invalid input: The params mediaaccount is not present`
        );
    }
    try {
        const db = new Database(
            process.env.DATABASE_HOST,
            process.env.DATABASE_USER,
            process.env.DATABASE_PASSWORD,
            process.env.DATABASE_NAME,
            process.env.DATABASE_PORT
        );

        const responseMediaAccount = await db.get(tables.MEDIA_ACCOUNT, null, [
            { key: "id", value: input.mediaaccount, sign: "=" }
        ]);

        if (
            responseMediaAccount &&
            responseMediaAccount.rows &&
            responseMediaAccount.rows.length == 0
        ) {
            throw new Error(
                `Invalid media account id: The account id is not present`
            );
        }

        const username = responseMediaAccount.rows[0].username;
        const cityId = responseMediaAccount.rows[0].cityid;
        const metadata = responseMediaAccount.rows[0].metadata
            ? JSON.parse(responseMediaAccount.rows[0].metadata)
            : false;

        const accountWebsite = metadata.accountWebsite;
        const API_USERNAME = metadata.username;
        const API_PASSWORD = metadata.password;

        const showExternal = metadata.showExternal;
        if (!metadata.pageName) {
            throw new Error(`The pageName is not present in the metadata`);
        } else {
            pageName = metadata.pageName;
        }
        if (!metadata.categoryId) {
            throw new Error(`The categoryId is not present in the metadata`);
        }
        const categoryId = metadata.categoryId;
        if (metadata.categoryId == 1 && !metadata.subcategoryId) {
            //check if news category has a subcategory
            throw new Error(`The subcategoryId is not present in the metadata`);
        }
        if (!metadata.userId) {
            userId = await createNewMediaUser(
                username,
                accountWebsite,
                metadata
            );
        } else {
            userId = metadata.userId;
        }
        const cityUserId = await getCityUserId(userId);
        let updatedListings = [];

        const sheetData = await scrapeAllPages(
            accountWebsite,
            API_USERNAME,
            API_PASSWORD
        );

        for (let i = 0; i < sheetData.length; i++) {
            const response = await parseData(
                sheetData[i],
                cityUserId,
                showExternal,
                metadata,
                categoryId
            );

            if (response) {
                updatedListings.push(response);
            }
        }

        if (updatedListings && updatedListings.length > 0) {
            const tableName = await createTemporaryTable(updatedListings);
            const mergeQuery = `insert into listings (userId, title, description, website, createdAt, startDate, expiryDate, endDate, categoryId, subcategoryId, statusId, sourceId, externalId, showExternal, place, address, latitude, longitude)
      select t2.userId, t2.title, t2.description, t2.website, t2.createdAt, t2.startDate, t2.expiryDate, t2.endDate, t2.categoryId, t2.subcategoryId, t2.statusId, t2.sourceId, t2.externalId, t2.showExternal, t2.place, t2.address, t2.latitude, t2.longitude
      from ${tableName} t2 left join listings t1
      on t2.externalId = t1.externalId
      where t1.externalId is null;`;

            const joinIdquery = `UPDATE ${tableName} temp
      INNER JOIN listings main ON temp.externalId = main.externalId
      SET temp.id = main.id where temp.externalId is not null;`;


      const insertMappingQuery = `INSERT INTO city_listing_mappings (cityId, listingId, statusid)
        SELECT ${cityId}, temp.id, temp.statusId
        FROM ${tableName} temp
        WHERE temp.id IS NOT NULL
        AND NOT EXISTS (
            SELECT 1
            FROM city_listing_mappings clm
            WHERE clm.listingId = temp.id
            AND clm.cityId = ${cityId}
        );`;

            const updateMappingStatusQuery = `UPDATE city_listing_mappings clm
        INNER JOIN ${tableName} temp ON clm.listingId = temp.id AND clm.cityId = ${cityId}
        SET clm.statusid = temp.statusId;`;

            const deleteQuery = `DELETE FROM listing_images WHERE listingId in (Select id FROM ${tableName});`;

            const addImageQuery = `INSERT INTO listing_images (imageOrder, logo, listingId)
      SELECT 1 as imageOrder, t.logo, t.id as listingId
      FROM ${tableName} t`;

            const dropTempTableQuery = `DROP TABLE IF EXISTS ${tableName};`;

            try {
                await db.callQuery(mergeQuery, null);
                await db.callQuery(joinIdquery, null);
                await db.callQuery(insertMappingQuery, null);
                await db.callQuery(updateMappingStatusQuery, null);
                await db.callQuery(deleteQuery, null);
                await db.callQuery(addImageQuery, null);
                await db.callQuery(dropTempTableQuery, null);
            } catch (error) {
                throw new Error(`${error}`);
            }
            console.log("Listings added to the database: " + username);
            return { message: "Merged Listings:" + username };
        } else if (updatedListings && updatedListings.length === 0) {
            return { message: "No listings to add: " + username };
        }
    } catch (error) {
        if (error.name === "AxiosError") {
            let err = JSON.stringify(error.response.data);
            throw new Error(`Error fetching google sheets: ${err}`);
        }
        throw new Error(`Error: ${error.message}`);
    }
}

module.exports = {
    uploadListings,
    processInput
};
