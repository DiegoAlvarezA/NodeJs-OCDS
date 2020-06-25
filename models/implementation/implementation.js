const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const functions = require('../../util/functions');
const dayjs = require('dayjs');

const implementationSchema = new Schema({
    transactions: {
        type: [{
            id: { type: String, required: true },
            source: { type: String, required: true },
            date: { type: String, default: dayjs().format(), validate: functions.isValidDateFormat },
            value: {
                type: require('../commons/amount'),
                required: true
            },
            payer: {
                type: [require('../organization/organization')],
                validate: [functions.isEmptyArray, functions.areIdsDuplicate],
                default: void 0
            },
            payee: {
                type: [require('../organization/organization')],
                validate: [functions.isEmptyArray, functions.areIdsDuplicate],
                default: void 0
            },
            uri: { type: String, validate: functions.isURI },
            _id: false
        }],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    milestones: {
        type: [require('../commons/milestone')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    documents: {
        type: [require('../commons/document')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    _id: false
});

module.exports = implementationSchema;