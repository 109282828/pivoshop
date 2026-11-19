const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'pivoshop.json');
let savedBusinesses = [];

if (fs.existsSync(DB_FILE)) {
    try {
        savedBusinesses = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {}
}

function saveToFile() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(savedBusinesses, null, 2));
    } catch (e) {}
}

module.exports = {
    addBusiness(biz) {
        if (!savedBusinesses.find(b => b.name === biz.name)) {
            savedBusinesses.push(biz);
            saveToFile();
        }
    },
    getBusinesses() {
        return savedBusinesses;
    },
    clear() {
        savedBusinesses = [];
        saveToFile();
    }
};
