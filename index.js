require("dotenv").config();
const { Service } = require("utils-heidi");
const { processInput } = require("./uploadListings");

async function main() {
    let date = new Date();
    let startTime =
        date.toISOString().slice(0, 10) +
        " " +
        date.toLocaleString("CET", {
            hour: "2-digit",
            hour12: false,
            minute: "2-digit",
            second: "2-digit"
        });

    console.log("Started Web Scraping Service at " + startTime);
    const serviceId = 4;

    const service = new Service(
        process.env.DATABASE_HOST,
        process.env.DATABASE_USER,
        process.env.DATABASE_PASSWORD,
        process.env.DATABASE_NAME,
        process.env.DATABASE_PORT,
        serviceId
    );

    try {
        let inputs = await service.getInputs(process.env.BATCH_SIZE);
        while (inputs) {
            const tasks = []; //add tasks here
            for (const input of inputs) {
                tasks.push(processInput(input, service));
            }
            try {
                var responses = await Promise.all(tasks);
                if (responses.includes(false)) {
                    console.log("Stopped Web Scraping Service");
                    break;
                }
            } catch (error) {
                console.error(error);
            }
            inputs = await service.getInputs(process.env.BATCH_SIZE);
        }
    } catch (error) {
        console.error(error);
    }
}

(async () => {
    try {
        await main();
        return process.exit(0);
    } catch (error) {
        logger.error(`Scraper failed: ${err.message}`);
        return process.exit(1);
    }
})();
