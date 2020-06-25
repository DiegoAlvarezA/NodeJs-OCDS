module.exports = {
    ROLES: ['buyer', 'procuringEntity', 'supplier', 'tenderer', 'funder', 'enquirer', 'payer', 'payee', 'reviewBody', 'interestedParty'],
    CURRENCIES: ['COP', 'USD'],
    OCID: 'ocds-k50g02-',
    CONTRACT_STATUS: ['pending', 'active', 'cancelled', 'terminated'],
    TAGS: ['planning', 'planningUpdate', 'tender', 'tenderAmendment', 'tenderUpdate', 'tenderCancellation', 'award', 'awardUpdate', 'awardCancellation', 'contract', 'contractUpdate', 'contractAmendment', 'implementation', 'implementationUpdate', 'contractTermination', 'compiled'],
    TENDER_STATUS: ['planning', 'planned', 'active', 'cancelled', 'unsuccessful', 'complete', 'withdrawn'],
    AWARD_STATUS: ['pending', 'active', 'cancelled', 'unsuccessful'],
    SCHEME: ['COL-IDCARD', 'CO-RUE'],
    LANGUAGE: ['es', 'en'],
    DOCUMENT_TYPE: ['plannedProcurementNotice', 'tenderNotice', 'awardNotice', 'contractNotice', 'completionCertificate', 'procurementPlan', 'biddingDocuments', 'technicalSpecifications', 'evaluationCriteria', 'evaluationReports', 'contractDraft', 'contractSigned', 'contractArrangements', 'contractSchedule', 'physicalProgressReport', 'financialProgressReport', 'finalAudit', 'hearingNotice', 'marketStudies', 'eligibilityCriteria', 'clarifications', 'shortlistedFirms', 'environmentalImpact', 'assetAndLiabilityAssessment', 'riskProvisions', 'winningBid', 'complaints', 'contractAnnexe', 'contractGuarantees', 'subContract', 'needsAssessment', 'feasibilityStudy', 'projectPlan', 'billOfQuantity', 'bidders', 'conflictOfInterest', 'debarments', 'illustration', 'submissionDocuments', 'contractSummary', 'cancellationDetails'],
    MIME_TYPE: ['application/json', 'application/zip', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.text', 'text/html', 'text/xml', 'text/csv', 'text/plain', 'image/png', 'image/jpeg', 'application/vnd.api+json'],
    additionalProcurementCategories: ['goods', 'works', 'services', 'consultingServices'],
    procurementMethod: ['open', 'selective', 'limited', 'direct'],
    itemClassification: ['CPV', 'CPVS', 'GSIN', 'UNSPSC', 'CPC', 'OKDP', 'OKPD', 'CUCOP'],
    classifiersGoodsServicesURI: 'http://www.colombiacompra.gov.co/clasificador-de-bienes-y-servicios',
    queryCacheSeconds: 3600,
    pageLimit: 15,
    contractsPerParty: 10,
    DOC_POPULATE: [
        { $unwind: '$parties' },
        { $lookup: { from: 'organizationreferences', localField: 'parties.organizationRef', foreignField: '_id', as: 'parties.organizationRef' } },
        { $unwind: '$parties.organizationRef' },
        { $addFields: { 'parties.organizationRef.roles': '$parties.roles' } },
        { $unwind: { path: '$awards', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'organizationreferences', localField: 'awards.suppliers', foreignField: '_id', as: 'awards.suppliers' } },
        { $lookup: { from: 'organizationreferences', localField: 'buyer', foreignField: '_id', as: 'buyer' } },
        { $unwind: '$buyer' },
        { $lookup: { from: 'organizationreferences', localField: 'tender.procuringEntity', foreignField: '_id', as: 'tender.procuringEntity' } },
        { $unwind: { path: '$tender.procuringEntity', preserveNullAndEmptyArrays: true } },
        {
            $group: {
                _id: '$_id',
                language: { $first: '$language' },
                ocid: { $first: '$ocid' },
                id: { $first: '$id' },
                date: { $first: '$date' },
                tag: { $first: '$tag' },
                initiationType: { $first: '$initiationType' },
                parties: { $addToSet: '$parties.organizationRef' },
                buyer: { $first: '$buyer' },
                planning: { $first: '$planning' },
                tender: { $first: '$tender' },
                awards: { $addToSet: '$awards' },
                contracts: { $first: '$contracts' }
            },

        },
        {
            $project: {
                language: 1,
                ocid: 1,
                id: 1,
                date: 1,
                tag: 1,
                initiationType: 1,
                parties: 1,
                buyer: 1,
                planning: {
                    $cond: [
                        { $eq: ['$planning', null] },
                        "$$REMOVE",
                        '$planning'
                    ]
                },
                tender: {
                    $cond: [
                        { $eq: ['$tender', null] },
                        "$$REMOVE",
                        '$tender'
                    ]
                },
                awards: {
                    $cond: [
                        {
                            $eq: [
                                {
                                    $size: {
                                        $filter: {
                                            input: '$awards', as: 'award', cond: {
                                                $and: [
                                                    { $ne: ['$$award.suppliers', null] },
                                                    { $ne: [{ $size: '$$award.suppliers' }, 0] }
                                                ]
                                            }
                                        }
                                    }
                                },
                                0]
                        },
                        "$$REMOVE",
                        '$awards'
                    ]
                },
                contracts: {
                    $cond: [
                        { $eq: ['$contracts', null] },
                        "$$REMOVE",
                        '$contracts'
                    ]
                }
            }
        },
        { $unset: ['buyer._id', 'buyer.__v', 'buyer.user', 'parties._id', 'parties.__v', 'parties.user', 'awards.suppliers._id', 'awards.suppliers.__v', 'tender.procuringEntity._id', 'tender.procuringEntity.__v', 'tender.procuringEntity.user'] }
    ]
}