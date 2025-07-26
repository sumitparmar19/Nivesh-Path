const { Schema } = require("mongoose");
const Holdingschema = new Schema({
    name: String,
    qty: Number,
    avg: Number,
    price: Number,
    net: String,
    day: String,
});

module.exports = { Holdingschema }