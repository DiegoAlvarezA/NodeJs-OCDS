const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const functions = require('../../util/functions');
const constants = require('../../util/constants');

const itemSchema = new Schema({
    id: { type: String, required: true },
    description: { type: String, required: true },
    classification: {
        scheme: {
            type: String,
            enum: constants.itemClassification,
            default: 'UNSPSC',
            required: true
        },
        id: { type: String, required: true },
        description: { type: String, required: true },
        uri: { type: String, default: constants.classifiersGoodsServicesURI, validate: functions.isURI }
    },
    additionalClassifications: {
        type: [{
            scheme: {
                type: String,
                enum: constants.itemClassification,
                default: 'UNSPSC'
            },
            id: String,
            description: String,
            uri: { type: String, default: constants.classifiersGoodsServicesURI, validate: functions.isURI },
            _id: false
        }],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    quantity: { type: Number },
    unit: {
        scheme: {
            type: String,
            enum: ['UNCEFACT', 'QUDT']
        },
        id: String,
        name: { type: String },
        value: {
            type: require('./amount')
        },
        uri: { type: String, validate: functions.isURI },
    },
    _id: false
});

module.exports = itemSchema;