const { Schema } = require("mongoose");
const Positionschema = new Schema({
    name: String,
    qty: Number,
    avg: Number,
    price: Number,
    net: String,
    day: String,
    isLoss: Boolean,
});

module.exports = { Positionschema }