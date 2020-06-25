const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const functions = require('../../util/functions');

const planningSchema = new Schema({
    rationale: { type: String, required: true },
    budget: {
        id: { type: String, required: true },
        description: { type: String, required: true },
        amount: {
            type: require('../commons/amount'),
            required: true
        },
        project: { type: String },
        projectID: { type: String },
        uri: { type: String, validate: functions.isURI },
        source: String
    },
    documents: {
        type: [require('../commons/document')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    milestones: {
        type: [require('../commons/milestone')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    _id: false
});

module.exports = planningSchema;