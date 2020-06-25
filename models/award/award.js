const mongoose = require('mongoose');
const Constants = require('../../util/constants');
const Schema = mongoose.Schema;
const dayjs = require('dayjs');
const functions = require('../../util/functions');

const awardSchema = new Schema({
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: {
        type: String,
        enum: Constants.AWARD_STATUS,
        required: true
    },
    date: {
        type: String,
        default: dayjs().format(),
        validate: [functions.isValidDateFormat, functions.isDateLessEqualToday]
    },
    value: {
        type: require('../commons/amount'),
        required: true
    },
    suppliers: [{
        type: Schema.Types.ObjectId,
        ref: 'OrganizationReference',
        default: void 0
    }],
    items: {
        type: [require('../commons/item')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    contractPeriod: require('../commons/period'),
    documents: {
        type: [require('../commons/document')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    amendments: {
        type: [require('../commons/amendment')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    _id: false
});

awardSchema.path('suppliers').required(true);
awardSchema.path('suppliers').default(undefined);
awardSchema.path('suppliers').validate(functions.isEmptyArray);
awardSchema.path('suppliers').validate(functions.areIdsDuplicate);

module.exports = awardSchema;
