const Release = require('../models/release/release');
const organizationReference = require('../models/organizationReference/organizationReference');
const dayjs = require('dayjs');
const { queryCacheSeconds, DOC_POPULATE, pageLimit, contractsPerParty, SCHEME } = require('../util/constants');

exports.getPartyInfo = async (req, res, next) => {
    if (req.params.idname || (req.query.filtername != null && req.query.filtername.length > 0)) {
        //const query = { '$regex': req.query.filtername + '.*', '$options': 'i' };
        const name = req.params.idname || req.query.filtername
        const pipeline = partyPipeline(req, true);
        const data = await Release.aggregate(pipeline).cache(queryCacheSeconds);
        return res.json({
            status: true,
            message: `Contratos para: ${name}`,
            data
        })
    } else {
        const data = [];
        const sorter = {
            supplier: 'supplier',
            buyer: 'buyer',
        };
        const sort = !req.query.sort || req.query.sort.length == 0 || !(req.query.sort in sorter) ? req.query.sort : sorter[req.query.sort];
        const page = req.query.page == null || req.query.page.length == 0 ? 0 : req.query.page;
        req.query.scheme = !req.query.scheme || req.query.scheme == 0 || !(SCHEME.includes(req.query.scheme.toUpperCase())) ? '' : req.query.scheme;
        const partiesNamePipeline = [
            { $match: { 'identifier.scheme': { $regex: req.query.scheme, $options: 'i' } } },
            { $skip: page * pageLimit },
            { $limit: pageLimit }
        ];
        const totalParties = await organizationReference.estimatedDocumentCount().cache(0, 'totalParties');
        const partiesName = await organizationReference.aggregate(partiesNamePipeline).cache(1800);
        for (party of partiesName) {
            const pipeline = partyPipeline(req, false, party.name);
            try {
                const partyInfo = await Release.aggregate(pipeline).cache(queryCacheSeconds);
                if (partyInfo.length) data.push(partyInfo[0]);
            } catch (error) {
                return res.status(500).json({
                    status: false,
                    message: error
                });
            };
        };
        data.sort((a, b) => sort == 'supplier' ? a.countBuyerContracts + b.countBuyerContracts : a.countBuyerContracts - b.countBuyerContracts);
        res.json({
            status: true,
            message: `Parties`,
            data: { parties: data, total: data.length },
            totalParties
        })
    }
};

const partyPipeline = (req, isSigleParty, singleName) => {
    const name = req.params.idname || req.query.filtername || singleName;
    const query = { $regex: name, $options: 'i' };
    const extendedInfo = isSigleParty ? '' : '.id';

    const year = !req.query.year || req.query.year.length == 0 ? parseInt(dayjs().format('YYYY')) : parseInt(req.query.year);
    const contractsPage = req.query.contractsPage == null || req.query.contractsPage.length == 0 ? 0 : req.query.contractsPage;
    const contractsSupplierPage = req.query.contractsSupplierPage == null || req.query.contractsSupplierPage.length == 0 ? 0 : req.query.contractsSupplierPage;
    const contractsBuyerPage = req.query.contractsBuyerPage == null || req.query.contractsBuyerPage.length == 0 ? 0 : req.query.contractsBuyerPage;

    const supplierMin = req.query.supplierMin == null || req.query.supplierMin.length == 0 ? 0 : parseInt(req.query.supplierMin);
    const supplierMax = req.query.supplierMax == null || req.query.supplierMax.length == 0 ? Number.MAX_VALUE : parseInt(req.query.supplierMax);
    const supplierNumContractMin = req.query.supplierNumContractMin == null || req.query.supplierNumContractMin.length == 0 ? 0 : parseInt(req.query.supplierNumContractMin);
    const supplierNumContractMax = req.query.supplierNumContractMax == null || req.query.supplierNumContractMax.length == 0 ? Number.MAX_VALUE : parseInt(req.query.supplierNumContractMax);

    const buyerMin = req.query.buyerMin == null || req.query.buyerMin.length == 0 ? 0 : parseInt(req.query.buyerMin);
    const buyerMax = req.query.buyerMax == null || req.query.buyerMax.length == 0 ? Number.MAX_VALUE : parseInt(req.query.buyerMax);
    const buyerNumContractMin = req.query.buyerNumContractMin == null || req.query.buyerNumContractMin.length == 0 ? 0 : parseInt(req.query.buyerNumContractMin);
    const buyerNumContractMax = req.query.buyerNumContractMax == null || req.query.buyerNumContractMax.length == 0 ? Number.MAX_VALUE : parseInt(req.query.buyerNumContractMax);

    const generalStage = {
        $match: {
            $or: [
                { 'release.buyer.name': query },
                { 'release.buyer.id': query },
                { 'release.parties.name': query },
                { 'release.parties.identifier.id': query },
            ]
        }
    };
    const supplierAmount = {
        $match: {
            $expr: {
                $and: [
                    { $gte: ['$release.contracts.value.amount', supplierMin] },
                    { $lte: ['$release.contracts.value.amount', supplierMax] }
                ]
            }
        }
    };
    const buyerAmount = {
        $match: {
            $expr: {
                $and: [
                    { $gte: ['$release.contracts.value.amount', buyerMin] },
                    { $lte: ['$release.contracts.value.amount', buyerMax] }
                ]
            }
        }
    };
    const supplierStage = {
        $match: {
            $and: [
                {
                    $or: [
                        { 'release.parties.name': query },
                        { 'release.parties.identifier.id': query }]
                },
                { $expr: { $in: ['supplier', '$release.parties.roles'] } }
            ]
        }
    };
    const buyerStage = {
        $match: {
            $and: [
                {
                    $or: [
                        { 'release.buyer.name': query },
                        { 'release.buyer.id': query }]
                },
                { $expr: { $in: ['supplier', '$release.parties.roles'] } }
            ]
        }
    };
    const pipeline =
        [
            { $sort: { _id: -1 } },
            { $group: { _id: '$ocid', release: { "$first": "$$ROOT" } } },
            generalStage,
            //{ $match: { $expr: { $eq: [{ $year: { $dateFromString: { dateString: '$release.date' } } }, year] } } },
            { $unwind: { path: '$release.awards', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$release.contracts', preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    $or: [
                        {
                            $and: [
                                { 'release.awards': { $exists: false } },
                                { 'release.contracts': { $exists: true } }
                            ]
                        },
                        { $expr: { $eq: ['$release.contracts.awardID', '$release.awards.id'] } }
                    ]
                }
            },
            { $unwind: '$release.parties' },
            {
                $facet: {
                    supplierContracts: [
                        supplierStage,
                        supplierAmount,
                        {
                            $group: {
                                _id: '$release.buyer',
                                contracts: {
                                    $push: {
                                        $switch: {
                                            branches: [
                                                {
                                                    case: {
                                                        $and: [
                                                            { $ne: ['release.awards', null] },
                                                            { $ne: [{ $type: '$release.awards.suppliers' }, 'missing'] }
                                                        ]
                                                    },
                                                    then: {
                                                        $cond: [
                                                            {
                                                                $gt: [
                                                                    { $size: { $filter: { input: '$release.awards.suppliers', as: 'supplier', cond: { $eq: ["$$supplier.id", '$release.parties.id'] } } } },
                                                                    0]
                                                            },
                                                            { ocid: '$release.ocid', value: '$release.contracts.value', contractID: '$release.contracts' + extendedInfo }, "$$REMOVE"
                                                        ]
                                                    }
                                                }
                                            ],
                                            default: {
                                                $cond: [
                                                    {
                                                        $and: [
                                                            { $ne: ['release.contracts', null] },
                                                            { $in: ['supplier', '$release.parties.roles'] }
                                                        ]
                                                    },
                                                    { ocid: '$release.ocid', value: '$release.contracts.value', contractID: '$release.contracts' + extendedInfo }, "$$REMOVE"
                                                ]
                                            }
                                        }
                                    }
                                },
                            }
                        },
                        { $unwind: '$contracts' },
                        {
                            $group:
                            {
                                _id: { currency: '$contracts.value.currency', buyer: '$_id' },
                                totalAmount: { $sum: '$contracts.value.amount' },
                                contracts: { $push: '$contracts' },
                            }
                        },
                        {
                            $group:
                            {
                                _id: { buyer: '$_id.buyer' },
                                totalAmount: { $push: { currency: '$_id.currency', total: '$totalAmount' } },
                                contracts: { $first: '$contracts' },
                            }
                        },
                        { $unset: '_id.buyer.identifier' },
                        { $sort: { 'totalAmount.0.total': -1 } },
                        {
                            $project: {
                                _id: 1,
                                totalAmount: 1,
                                contracts: { $slice: ["$contracts", contractsSupplierPage * contractsPerParty, contractsPerParty] }
                            }
                        }
                    ],
                    buyerContracts: [
                        buyerStage,
                        buyerAmount,
                        {
                            $group: {
                                _id: '$release.parties',
                                contracts: {
                                    $push: {
                                        $cond: [
                                            {
                                                $and: [
                                                    { $ne: ['release.contracts', null] }
                                                ]
                                            },
                                            { ocid: '$release.ocid', value: '$release.contracts.value', contractID: '$release.contracts' + extendedInfo }, "$$REMOVE"
                                        ]
                                    }
                                },
                            }
                        },
                        { $unwind: '$contracts' },
                        {
                            $group:
                            {
                                _id: { currency: '$contracts.value.currency', supplier: '$_id' },
                                totalAmount: { $sum: '$contracts.value.amount' },
                                contracts: { $push: '$contracts' },
                            }
                        },
                        {
                            $group:
                            {
                                _id: { supplier: '$_id.supplier' },
                                totalAmount: { $push: { currency: '$_id.currency', total: '$totalAmount' } },
                                contracts: { $first: '$contracts' },
                            }
                        },
                        { $unset: ['_id.supplier.identifier', '_id.supplier.roles'] },
                        { $sort: { 'totalAmount.0.total': -1 } },
                        {
                            $project: {
                                _id: 1,
                                totalAmount: 1,
                                contracts: { $slice: ["$contracts", contractsBuyerPage * contractsPerParty, contractsPerParty] }
                            }
                        }
                    ],
                    procurementMethodSupplier: [
                        supplierStage,
                        supplierAmount,
                        {
                            $group: {
                                _id: '$release.tender.procurementMethod',
                                count: {
                                    $sum: {
                                        $switch: {
                                            branches: [
                                                {
                                                    case: {
                                                        $and: [
                                                            { $ne: ['release.awards', null] },
                                                            { $ne: [{ $type: '$release.awards.suppliers' }, 'missing'] }
                                                        ]
                                                    },
                                                    then: {
                                                        $cond: [
                                                            {
                                                                $gt: [
                                                                    { $size: { $filter: { input: '$release.awards.suppliers', as: 'supplier', cond: { $eq: ["$$supplier.id", '$release.parties.id'] } } } },
                                                                    0]
                                                            },
                                                            1, "$$REMOVE"
                                                        ]
                                                    }
                                                }
                                            ],
                                            default: {
                                                $cond: [
                                                    {
                                                        $and: [
                                                            { $ne: ['release.contracts', null] },
                                                            { $in: ['supplier', '$release.parties.roles'] }
                                                        ]
                                                    },
                                                    1, "$$REMOVE"
                                                ]
                                            }
                                        }
                                    }
                                },
                            }
                        }
                    ],
                    procurementMethodBuyer: [
                        buyerStage,
                        buyerAmount,
                        {
                            $group: {
                                _id: '$release.tender.procurementMethod',
                                count: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $and: [
                                                    { $ne: ['release.contracts', null] }
                                                ]
                                            },
                                            1, "$$REMOVE"
                                        ]
                                    }
                                },
                            }
                        }
                    ],
                    countSupplierContracts: [
                        supplierStage,
                        {
                            $group: {
                                _id: {
                                    year: {
                                        $year: {
                                            $dateFromString: {
                                                dateString: '$release.contracts.dateSigned',
                                                onNull: '$release.date',
                                                onError: '$release.date'
                                            }
                                        }
                                    },
                                    currency: '$release.contracts.value.currency'
                                },
                                count: {
                                    $sum: {
                                        $switch: {
                                            branches: [
                                                {
                                                    case: {
                                                        $and: [
                                                            { $ne: ['release.awards', null] },
                                                            { $ne: [{ $type: '$release.awards.suppliers' }, 'missing'] }
                                                        ]
                                                    },
                                                    then: {
                                                        $cond: [
                                                            {
                                                                $gt: [
                                                                    { $size: { $filter: { input: '$release.awards.suppliers', as: 'supplier', cond: { $eq: ["$$supplier.id", '$release.parties.id'] } } } },
                                                                    0]
                                                            },
                                                            1, 0
                                                        ]
                                                    }
                                                }
                                            ],
                                            default: {
                                                $cond: [
                                                    {
                                                        $and: [
                                                            { $ne: ['release.contracts', null] },
                                                            { $in: ['supplier', '$release.parties.roles'] }
                                                        ]
                                                    },
                                                    1, 0
                                                ]
                                            }
                                        }
                                    }
                                },
                                totalAmount: {
                                    $sum: {
                                        $switch: {
                                            branches: [
                                                {
                                                    case: {
                                                        $and: [
                                                            { $ne: ['release.awards', null] },
                                                            { $ne: [{ $type: '$release.awards.suppliers' }, 'missing'] }
                                                        ]
                                                    },
                                                    then: {
                                                        $cond: [
                                                            {
                                                                $gt: [
                                                                    { $size: { $filter: { input: '$release.awards.suppliers', as: 'supplier', cond: { $eq: ["$$supplier.id", '$release.parties.id'] } } } },
                                                                    0]
                                                            },
                                                            '$release.contracts.value.amount', 0
                                                        ]
                                                    }
                                                }
                                            ],
                                            default: {
                                                $cond: [
                                                    {
                                                        $and: [
                                                            { $ne: ['release.contracts', null] },
                                                            { $in: ['supplier', '$release.parties.roles'] }
                                                        ]
                                                    },
                                                    '$release.contracts.value.amount', 0
                                                ]
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        {
                            $group: {
                                _id: '$_id.year',
                                totalByCurrency: { $push: { currency: '$_id.currency', count: '$count', totalAmount: '$totalAmount' } }
                            }
                        }
                    ],
                    countBuyerContracts: [
                        buyerStage,
                        {
                            $group: {
                                _id: {
                                    year: {
                                        $year: {
                                            $dateFromString: {
                                                dateString: '$release.contracts.dateSigned',
                                                onNull: '$release.date',
                                                onError: '$release.date'
                                            }
                                        }
                                    },
                                    currency: '$release.contracts.value.currency'
                                },
                                count: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $and: [
                                                    { $ne: ['release.contracts', null] }
                                                ]
                                            },
                                            1, 0
                                        ]
                                    }
                                },
                                totalAmount: {
                                    $sum: {
                                        $cond: [
                                            {
                                                $and: [
                                                    { $ne: ['release.contracts', null] }
                                                ]
                                            },
                                            '$release.contracts.value.amount', 0
                                        ]
                                    }
                                },
                            }
                        },
                        {
                            $group: {
                                _id: '$_id.year',
                                totalByCurrency: { $push: { currency: '$_id.currency', count: '$count', totalAmount: '$totalAmount' } }
                            }
                        }
                    ],
                }
            },
            {
                $project: {
                    name: 1,
                    supplierContracts: { $slice: ["$supplierContracts", contractsPage * contractsPerParty, contractsPerParty] },
                    buyerContracts: { $slice: ["$buyerContracts", contractsPage * contractsPerParty, contractsPerParty] },
                    procurementMethodSupplier: 1,
                    procurementMethodBuyer: 1,
                    countSupplierContracts: 1,
                    countBuyerContracts: 1,
                    totalBuyerContracts: {
                        $reduce: {
                            input: { $map: { input: '$countBuyerContracts', as: 'contract', in: { $sum: '$$contract.totalByCurrency.count' } } },
                            initialValue: 0,
                            in: { $sum: ['$$value', '$$this'] }
                        }
                    },
                    totalSupplierContracts: {
                        $reduce: {
                            input: { $map: { input: '$countSupplierContracts', as: 'contract', in: { $sum: '$$contract.totalByCurrency.count' } } },
                            initialValue: 0,
                            in: { $sum: ['$$value', '$$this'] }
                        }
                    },
                    party: 1,
                }
            },
            {
                $match: {
                    $expr: {
                        $and: [
                            { $gte: ['$totalBuyerContracts', buyerNumContractMin] },
                            { $lte: ['$totalBuyerContracts', buyerNumContractMax] }
                        ]
                    }
                }
            },
            {
                $match: {
                    $expr: {
                        $and: [
                            { $gte: ['$totalSupplierContracts', supplierNumContractMin] },
                            { $lte: ['$totalSupplierContracts', supplierNumContractMax] }
                        ]
                    }
                }
            },
            { $addFields: { party: name } }
        ]
    return [...DOC_POPULATE, ...pipeline];
};

exports.getOrganization = async (req, res, next) => {
    const page = req.query.page == null || req.query.page.length == 0 ? 0 : req.query.page;
    req.query.scheme = !req.query.scheme || req.query.scheme == 0 || !(SCHEME.includes(req.query.scheme.toUpperCase())) ? '' : req.query.scheme;
    const partiesNamePipeline = [
        { $sort: { 'name': 1 } },
        { $match: { 'identifier.scheme': { $regex: req.query.scheme, $options: 'i' } } },
        { $skip: page * pageLimit },
        { $limit: pageLimit },
        {
            $facet: {
                organizations: [
                    { $unset: ['_id', '__v'] }
                ],
                total: [
                    { $count: 'total' }
                ]
            }
        }
    ];
    const totalOrganizations = await organizationReference.countDocuments().cache(1800);
    const data = await organizationReference.aggregate(partiesNamePipeline).cache(queryCacheSeconds);
    res.json({
        status: true,
        message: `Organizaciones`,
        data,
        totalOrganizations
    })
};

exports.getContractsByOrganization = async (req, res, next) => {
    const pipeline = contractsByOrganizationPipeline(req.query);
    const data = await Release.aggregate(pipeline).cache(queryCacheSeconds);
    res.json({
        status: true,
        message: `Contratos`,
        data
    })
};

const contractsByOrganizationPipeline = (query) => {
    const nameIDquery = { $regex: query.filtername, $options: 'i' };
    const sorter = {
        supplier: -1,
        buyer: 1,
    };
    query.year = !query.year || query.year.length == 0 ? parseInt(dayjs().format('YYYY')) : parseInt(query.year);
    query.sort = !query.sort || query.sort.length == 0 || !(query.sort in sorter) ? -1 : sorter[query.sort];
    query.page = !query.page || query.page.length == 0 ? 0 : query.page;
    query.scheme = !query.scheme || query.scheme == 0 || !(SCHEME.includes(query.scheme.toUpperCase())) ? '' : query.scheme;
    query.limit = !query.limit || query.limit.length == 0 || query.limit > pageLimit || query.limit == "0" ? pageLimit : parseInt(query.limit);
    query.contractsSupplierPage = query.contractsSupplierPage == null || query.contractsSupplierPage.length == 0 ? 0 : query.contractsSupplierPage;
    query.contractsBuyerPage = query.contractsBuyerPage == null || query.contractsBuyerPage.length == 0 ? 0 : query.contractsBuyerPage;
    const pipeline = [
        { $sort: { _id: -1 } },
        { $group: { _id: '$ocid', release: { $first: '$$ROOT' } } },
        //{ $match: { $expr: { $eq: [{ $year: { $dateFromString: { dateString: '$release.date' } } }, query.year] } } },
        { $unwind: { path: '$release.awards', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$release.contracts', preserveNullAndEmptyArrays: true } },
        {
            $match: {
                $or: [
                    {
                        $and: [
                            { 'release.awards': { $exists: false } },
                            { 'release.contracts': { $exists: true } }
                        ]
                    },
                    { $expr: { $eq: ['$release.contracts.awardID', '$release.awards.id'] } }
                ]
            }
        },
        { $unwind: '$release.parties' },
        { $match: { 'release.parties.identifier.scheme': { $regex: query.scheme, $options: 'i' } } },
        {
            $match: {
                $or: [
                    { 'release.parties.name': nameIDquery },
                    { 'release.parties.identifier.id': nameIDquery },
                ]
            }
        },
        {
            $group: {
                _id: '$release.parties.identifier.id',
                name: { $first: '$release.parties.name' },
                supplierContracts: {
                    $push: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $and: [
                                            { $ne: ['release.awards', null] },
                                            { $ne: [{ $type: '$release.awards.suppliers' }, 'missing'] }
                                        ]
                                    },
                                    then: {
                                        $cond: [
                                            {
                                                $gt: [
                                                    { $size: { $filter: { input: '$release.awards.suppliers', as: 'supplier', cond: { $eq: ["$$supplier.id", '$release.parties.id'] } } } },
                                                    0]
                                            },
                                            { ocid: '$release.ocid', contractID: '$release.contracts.id', buyer: '$release.buyer.id', value: '$release.contracts.value' }, "$$REMOVE"
                                        ]
                                    }
                                }
                            ],
                            default: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: ['release.contracts', null] },
                                            { $in: ['supplier', '$release.parties.roles'] }
                                        ]
                                    },
                                    { ocid: '$release.ocid', contractID: '$release.contracts.id', buyer: '$release.buyer.id', value: '$release.contracts.value' }, "$$REMOVE"
                                ]
                            }
                        }
                    }
                },
                buyerContracts: {
                    $push: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ['release.contracts', null] },
                                    { $in: ['buyer', '$release.parties.roles'] }
                                ]
                            },
                            { ocid: '$release.ocid', contractID: '$release.contracts.id', supplier: '$release.parties.identifier.id', value: '$release.contracts.value' }, "$$REMOVE"
                        ]
                    }
                },
                totalSupplierContracts: {
                    $sum: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $and: [
                                            { $ne: ['release.awards', null] },
                                            { $ne: [{ $type: '$release.awards.suppliers' }, 'missing'] }
                                        ]
                                    },
                                    then: {
                                        $cond: [
                                            {
                                                $gt: [
                                                    { $size: { $filter: { input: '$release.awards.suppliers', as: 'supplier', cond: { $eq: ["$$supplier.id", '$release.parties.id'] } } } },
                                                    0]
                                            },
                                            1, "$$REMOVE"
                                        ]
                                    }
                                }
                            ],
                            default: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: ['release.contracts', null] },
                                            { $in: ['supplier', '$release.parties.roles'] }
                                        ]
                                    },
                                    1, "$$REMOVE"
                                ]
                            }
                        }
                    }
                },
                totalBuyerContracts: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ['release.contracts', null] },
                                    { $in: ['buyer', '$release.parties.roles'] }
                                ]
                            },
                            1, "$$REMOVE"
                        ]
                    }
                },
            },
        },
        {
            $project: {
                name: 1,
                supplierContracts: { $slice: ["$supplierContracts", query.contractsSupplierPage * contractsPerParty, contractsPerParty] },
                buyerContracts: { $slice: ["$buyerContracts", query.contractsBuyerPage * contractsPerParty, contractsPerParty] },
                totalSupplierContracts: 1,
                totalBuyerContracts: 1
            }
        },
        { $sort: { totalSupplierContracts: query.sort, totalBuyerContracts: -1 } },
        { $skip: query.page * pageLimit },
        { $limit: query.limit },
    ];
    return [...DOC_POPULATE, ...pipeline];
}

exports.registerOrganization = async (req, res, next) => {
    const organization = await organizationReference.findOne({ user: req.user._id });
    if (organization) {
        return res.status(200).json({
            status: false,
            message: 'Usuario ya tiene una organización registrada',
            data: organization
        });
    }
    const newOrganization = new organizationReference({
        ...req.body,
        user: req.user._id
    });
    newOrganization.save((err, organization) => {
        if (err) {
            if (err.code == 11000) {
                return res.status(400).json({ status: false, message: 'Organización ya se encuentra registrada' });
            }
            return res.status(400).json({ status: false, message: err });
        }
        res.status(201).json({
            status: true,
            message: 'Se ha registrado una nueva organización',
            data: organization
        });
    });
};

exports.userHasOrganization = (req, res, next) => {
    organizationReference.findOne({ user: req.user._id })
        .then(organization => {
            if (!organization) {
                return res.status(400).json({ status: false, message: 'El usuario no tiene una organización registrada' });
            }
            next();
        })
        .catch(err => {
            res.status(500).json({ status: false, message: err });
        });
};

exports.updateOrganization = (req, res) => {
    organizationReference.findOneAndUpdate({ $and: [{ id: req.body.id }, { user: req.user._id }] }, req.body, { new: true, runValidators: true })
        .then(organization => {
            if (!organization) {
                return res.status(401).json({ status: false, message: 'Organización no existe, o no pertenece a el usuario' });
            };
            res.status(200).json({
                status: true,
                message: 'Se ha actualizado la organización',
                data: organization
            });
        })
        .catch(err => {
            res.status(500).json({ status: false, message: err });
        });
};

exports.assignUserToOrganization = (req, res) => {
    organizationReference.findOne({ user: req.user._id })
        .then(organization => {
            if (organization) {
                throw { message: 'Usuario ya tiene una organización registrada', data: organization };
            }
            return organizationReference.findOne({ 'identifier.id': req.body.organizationID });
        })
        .then(organization => {
            if (!organization) {
                throw { message: 'Organización no existe', data: organization };
            };
            if (organization.user) {
                throw { message: 'Organización ya tiene un usuario registrado', data: organization };
            };
            organization.user = req.user._id;
            return organization.save();
        })
        .then(organization => {
            res.status(201).json({
                status: true,
                message: 'Se ha asignado el usuario a la organización',
                data: organization
            });
        })
        .catch(err => {
            res.status(400).json({ status: false, ...err });
        });
};
