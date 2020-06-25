const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const CONSTANTS = require('../../util/constants');

const amountSchema = new Schema({
    amount: { type: Number, required: true },
    currency: { type: String, enum: CONSTANTS.CURRENCIES, default: 'COP', required: true },
    _id: false
});

module.exports = amountSchema;