const mongoose = require('mongoose');
const Constants = require('../../util/constants');
const Schema = mongoose.Schema;
const functions = require('../../util/functions');

const tenderSchema = new Schema({
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: {
        type: String,
        enum: Constants.TENDER_STATUS,
        required: true
    },
    procuringEntity: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'OrganizationReference'
    },
    items: {
        type: [require('../commons/item')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    value: {
        type: require('../commons/amount'),
        required: function () { return /planning/.test(this.status) ? false : true; },
    },
    minValue: {
        type: require('../commons/amount')
    },
    procurementMethod: {
        type: String,
        enum: Constants.procurementMethod,
        required: true
    },
    procurementMethodDetails: String,
    procurementMethodRationale: String,
    mainProcurementCategory: {
        type: String,
        enum: ['goods', 'works', 'services']
    },
    additionalProcurementCategories: {
        type: [String],
        enum: Constants.additionalProcurementCategories,
        default: void 0
    },
    awardCriteria: {
        type: String,
        enum: ['priceOnly', 'costOnly', 'qualityOnly', 'ratedCriteria', 'lowestCost', 'bestProposal', 'bestValueToGovernment', 'singleBidOnly']
    },
    awardCriteriaDetails: String,
    submissionMethod: {
        type: [String],
        enum: ['electronicSubmission', 'electronicAuction', 'written', 'inPerson'],
        required: true,
        default: void 0
    },
    submissionMethodDetails: String,
    tenderPeriod: require('../commons/period'),
    enquiryPeriod: require('../commons/period'),
    hasEnquiries: Boolean,
    eligibilityCriteria: String,
    awardPeriod: require('../commons/period'),
    contractPeriod: require('../commons/period'),
    numberOfTenderers: {
        type: Number,
        required: function () { return /planning|planned/.test(this.status) ? false : true; }
    },
    tenderers: {
        type: [{
            id: { type: String, required: true },
            name: { type: String, required: true },
            identifier: {
                scheme: { type: String, required: true },
                id: { type: String, required: true },
                legalName: String,
                uri: { type: String, validate: functions.isURI }
            },
            additionalIdentifiers: {
                scheme: String,
                id: String,
                legalName: String,
                uri: { type: String, validate: functions.isURI }
            },
            address: {
                streetAddress: String,
                locality: String,
                region: String,
                postalCode: String,
                countryName: String
            },
            contactPoint: {
                name: String,
                email: String,
                telephone: String,
                faxNumber: String,
                url: { type: String, validate: functions.isURL }
            },
            _id: false
        }],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
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
    amendments: {
        type: [require('../commons/amendment')],
        validate: [functions.isEmptyArray, functions.areIdsDuplicate],
        default: void 0
    },
    _id: false
});

// tenderSchema.pre('validate', function (next) {
//     if (!this.procuringEntity) {
//         this.procuringEntity = {
//             id: this.parent().buyer.id,
//             name: this.parent().buyer.name
//         };
//         return next();
//     } else {
//         return next();
//     };
// });

module.exports = tenderSchema;