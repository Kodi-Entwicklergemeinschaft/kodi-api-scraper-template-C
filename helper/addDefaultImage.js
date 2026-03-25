const categories = require("../constants/categories");
const defaultImageCount = require("../constants/defaultImagesInBucketCount");

function addDefaultImage(categoryId){

    function getRandomNumber(n) {
        return Math.floor(Math.random() * n) + 1;
      }
    const DEFAULTIMAGE = "Defaultimage";
    const categoryName = Object.keys(categories).find(key => categories[key] === +categoryId);
    const moduloValue = getRandomNumber(defaultImageCount[categoryName]);
    const imageName = `admin/${categoryName}/${DEFAULTIMAGE}${moduloValue}.png`;
    return imageName;
}

module.exports = { addDefaultImage }