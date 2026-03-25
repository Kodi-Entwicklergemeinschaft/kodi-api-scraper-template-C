function parseGermanDate(dateStr) {
    const months = {
        Januar: 1,
        Jan: 1,
        Februar: 2,
        Feb: 2,
        März: 3,
        Mär: 3,
        April: 4,
        Apr: 4,
        Mai: 5,
        Juni: 6,
        Jun: 6,
        Juli: 7,
        Jul: 7,
        August: 8,
        Aug: 8,
        September: 9,
        Sep: 9,
        Oktober: 10,
        Okt: 10,
        November: 11,
        Nov: 11,
        Dezember: 12,
        Dez: 12
    };

    let day, month, year;

    const dateParts = dateStr.split('.');
    if (isNaN(dateParts[0])) {
        // If the first part is not a number, assume it's month.day
        month = months[dateParts[0]];
        day = parseInt(dateParts[1], 10);
    } else {
        // If the first part is a number, assume it's day.month
        day = parseInt(dateParts[0], 10);
        month = isNaN(dateParts[1]) ? months[dateParts[1]] : parseInt(dateParts[1], 10);
    }

    if (dateParts.length === 3) {
        // If a year is specified, parse it
        year = parseInt(dateParts[2], 10);
    } else {
        // Default to the current year if not specified
        year = new Date().getFullYear();
    }

    return { day, month, year };
}

function parseISODate(dateStr) {
    // Accept forms like YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS... (we only use the date part)
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const [, y, mm, dd] = m;
    return { day: parseInt(dd, 10), month: parseInt(mm, 10), year: parseInt(y, 10) };
}

function normalizeTime(timeStr) {
    if (!timeStr) return "00:00:00";
    const t = String(timeStr).trim();
    if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
    if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
    // Fallback: if it's invalid, return default midnight to avoid DB errors
    return "00:00:00";
}

function formatDateTime(dateObj, timeStr) {
    let { day, month, year } = dateObj;
    if (year < 100) {
        year += 2000;
    }

    // Construct date in YYYY-MM-DD format
    const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Use default time if missing and normalize HH:MM -> HH:MM:00
    const formattedTime = normalizeTime(timeStr);

    // Combine date and time in the desired format
    return `${formattedDate} ${formattedTime}`;
}

function createTimestamp(date, time) {
    if (!date) return null;
    let parsedDate = parseISODate(date);
    if (!parsedDate) {
        parsedDate = parseGermanDate(date);
    }
    if (!parsedDate || !parsedDate.day || !parsedDate.month || !parsedDate.year) {
        throw new Error("invalid date format");
    }
    if (parsedDate.month < 1 || parsedDate.month > 12) {
        throw new Error("invalid date format");
    }
    // Basic day range check (does not account for all month/day edge cases, but prevents NaN)
    if (parsedDate.day < 1 || parsedDate.day > 31) {
        throw new Error("invalid date format");
    }
    return formatDateTime(parsedDate, time);
}

module.exports = { createTimestamp };