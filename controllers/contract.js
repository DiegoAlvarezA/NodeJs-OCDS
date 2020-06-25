const XLSX = require('xlsx');
const dayjs = require('dayjs');
const Validator = require('jsonschema').Validator;
const diff = require('deep-diff').diff;
const FileType = require('file-type');

const Release = require('../models/release/release');
const organizationReference = require('../models/organizationReference/organizationReference');
const OCID = require('../util/constants').OCID
const constants = require('../util/constants')
const User = require('../models/user/user');
const { deleteFile } = require('../util/file');

let contractPath;
exports.uploadContracts = async (req, res, next) => {
    try {
        const contract = req.file;
        if (!contract) {
            res.status(400).json({
                status: false,
                message: 'No file is selected.',
                data: {}
            });
        } else {
            contractPath = contract.path;
            const fileType = await FileType.fromFile(contractPath);
            if (fileType.ext !== 'xlsx' ||
                fileType.mime !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
                throw (`Only xls/xlsx files are allowed.`);
            }
            const buyer = await organizationReference.findOne({ user: req.user._id });
            const jsonContracts = await vaidateContractData(contractPath, buyer)
            saveReleases(jsonContracts, buyer);
            res.status(401).json({
                status: true,
                message: 'El archivo se ha subido y se han creado nuevos contratos',
                data: {
                    name: contract.originalname,
                    mimetype: contract.mimetype,
                    size: contract.size
                }
            });
        }
    } catch (err) {
        console.log(err)
        deleteFile(contractPath);
        if (typeof err !== 'object') {
            err = err.toString();
        }
        res.status(400).json({
            errors: err,
            status: false
        });
    }
}

async function saveReleases(jsonContracts, buyer) {
    const releases = [];
    const parties = [];
    for (const contract of jsonContracts) {
        let supplier = parties.find(party => party.id == contract['NIT/CEDULA DEL CONTRATISTA']);
        if (!supplier) {
            supplier = await organizationReference.findOne({ id: contract['NIT/CEDULA DEL CONTRATISTA'] });
            if (!supplier) {
                supplier = new organizationReference({
                    identifier: {
                        scheme: contract['TIPO DE IDENTIFICACION'],
                        id: contract['NIT/CEDULA DEL CONTRATISTA'],
                        legalName: contract['CONTRATISTA SELECCIONADO'],
                    },
                    name: contract['CONTRATISTA SELECCIONADO'],
                    id: contract['NIT/CEDULA DEL CONTRATISTA']
                });
                parties.push(supplier);
            };
        };
        releases.push(newRelease(contract, buyer, supplier));
    };
    Release.insertMany(releases, { limit: 200 }, (error, docs) => {
        if (error) {
            return console.log(`Error procesando documentos: ${error}`);
        };
        if (parties.length) {
            organizationReference.insertMany(parties, { ordered: false });
            cache.clearCache('totalParties');
        }
        updateInternalNumbersView();
        cache.clearCache('totalContracts');
    });
};

async function vaidateContractData(file, buyer) {
    let internalNumbers = mongoConn.db.collection('internalNumbers');
    let fieldValidationErrors = [];
    let releasesAlreadyRegistered = [];
    const jsonContracts = readFile(file);
    if (jsonContracts.length > 200) {
        throw ('Sólo se permiten 200 contratos por documento');
    }
    const v = new Validator();
    const schema = {
        'id': '/JsonContract',
        'type': 'object',
        'properties': {
            'NUMERO INTERNO DEL CONTRATO': {
                'type': 'string',
                'pattern': "^[^-].*[^-]$"
            },
            'FECHA FIRMA DEL CONTRATO O CREACION DEL PROCESO': { 'type': 'date' },
            'ESTADO DEL PROCESO': {
                'type': 'string',
                'enum': constants.CONTRACT_STATUS.map(i => i.toUpperCase())
            },
            'TIPO DE CONTRATACION': {
                'type': 'string',
                'enum': constants.additionalProcurementCategories.map(i => i.toUpperCase())
            },
            'MODALIDAD DE CONTRATACION': {
                'type': 'string',
                'enum': constants.procurementMethod.map(i => i.toUpperCase())
            },
            'OBJETO DEL CONTRATO': { 'type': 'string' },
            'VALOR INICIAL DEL CONTRATO': { 'type': 'number' },
            'VALOR TOTAL DEL CONTRATO (CON ADICIONES)': { 'type': 'number' },
            'NUMERO DE PROPONENTES': { 'type': 'number' },
            'CONTRATISTA SELECCIONADO': { 'type': 'string' },
            'TIPO DE IDENTIFICACION': {
                'type': 'string',
                'enum': constants.SCHEME.map(i => i.toUpperCase())
            },
            'NIT/CEDULA DEL CONTRATISTA': { 'type': 'number' },
            'REPRESENTANTE LEGAL DEL CONTRATISTA': { 'type': 'string' },
            'PLAZO DE EJECUCION DEL CONTRATO': { 'type': 'string' },
            'FECHA DE INICIO DEL CONTRATO': { 'type': 'date' },
            'FECHA DE TERMINACION DEL CONTRATO': { 'type': 'date' },
        },
        'required': [
            'NUMERO INTERNO DEL CONTRATO',
            'FECHA FIRMA DEL CONTRATO O CREACION DEL PROCESO',
            'ESTADO DEL PROCESO',
            'TIPO DE CONTRATACION',
            'MODALIDAD DE CONTRATACION',
            'OBJETO DEL CONTRATO',
            'VALOR TOTAL DEL CONTRATO (CON ADICIONES)',
            'CONTRATISTA SELECCIONADO',
            'TIPO DE IDENTIFICACION',
            'NIT/CEDULA DEL CONTRATISTA',
            'FECHA DE INICIO DEL CONTRATO'
        ]
    };
    internalNumbers = await internalNumbers.find().toArray();
    for (contract of jsonContracts) {
        const errors = v.validate(contract, schema)['errors'];
        if (internalNumbers.length && internalNumbers[0].ids.includes(contract['NUMERO INTERNO DEL CONTRATO'])) {
            releasesAlreadyRegistered.push({
                'NUMERO INTERNO DEL CONTRATO': contract['NUMERO INTERNO DEL CONTRATO'],
                sheetname: contract.sheet,
                row: contract.row
            })
        };
        if (buyer.id == contract['NIT/CEDULA DEL CONTRATISTA']) {
            fieldValidationErrors.push({
                sheetname: contract.sheet,
                row: contract.row,
                field: 'NIT/CEDULA DEL CONTRATISTA no puede ser igual al del comprador',
            })
        };
        if ('FECHA DE TERMINACION DEL CONTRATO' in contract && errors.filter((e) => e.property == 'instance["FECHA DE TERMINACION DEL CONTRATO"]').length == 0) {
            if (dayjs(contract['FECHA DE TERMINACION DEL CONTRATO']).format() < dayjs(contract['FECHA DE INICIO DEL CONTRATO']).format()) {
                fieldValidationErrors.push({
                    sheetname: contract.sheet,
                    row: contract.row,
                    field: 'FECHA DE TERMINACION DEL CONTRATO es menor a FECHA DE INICIO DEL CONTRATO',
                })
            }
        };
        if (errors && errors.length) {
            const parseErrors = errors.map((e) => {
                return {
                    sheetname: contract.sheet,
                    row: contract.row,
                    field: e.stack,
                };
            });
            fieldValidationErrors = fieldValidationErrors.concat(parseErrors);
        };
    };
    const lookup = jsonContracts.reduce((a, e) => {
        a[e['NUMERO INTERNO DEL CONTRATO']] = ++a[e['NUMERO INTERNO DEL CONTRATO']] || 0;
        return a;
    }, {});
    const duplicateContracts = jsonContracts.filter(e => lookup[e['NUMERO INTERNO DEL CONTRATO']]);
    if (fieldValidationErrors.length || duplicateContracts.length || releasesAlreadyRegistered.length) {
        throw { fieldValidationErrors, duplicateContracts, releasesAlreadyRegistered };
    }
    return jsonContracts;
};

function readFile(file) {
    let jsonContracts = [];
    const workbook = XLSX.readFile(file, { cellDates: true });
    const sheetNameList = workbook.SheetNames;
    for (const sheet of sheetNameList) {
        const contracts = workbook.Sheets[sheet];
        let headers = {};
        let data = [];
        for (let contract in contracts) {
            if (contract[0] === '!') continue;
            var tt = 0;
            for (var i = 0; i < contract.length; i++) {
                if (!isNaN(contract[i])) {
                    tt = i;
                    break;
                }
            };
            let col = contract.substring(0, tt);
            let row = parseInt(contract.substring(tt));
            let value = typeof contracts[contract].v === 'string' ?
                (contracts[contract].v).trim() : contracts[contract].v;
            if (row == 1 && value) {
                headers[col] = value;
                continue;
            }
            if (!data[row]) data[row] = { row, sheet };
            data[row][headers[col]] = value;
        };
        data.shift();
        data.shift();
        jsonContracts = jsonContracts.concat(data);
    };
    return jsonContracts;
}

exports.convertXlsxToJSON = async (req, res, next) => {
    try {
        const contract = req.file;
        if (!contract) {
            res.status(400).json({
                status: false,
                message: 'No file is selected.'
            });
        } else {
            contractPath = contract.path;
            const fileType = await FileType.fromFile(contractPath);
            if (fileType.ext !== 'xlsx' ||
                fileType.mime !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
                throw (`Only xls/xlsx files are allowed.`);
            }
            const jsonContracts = readFile(contractPath);
            deleteFile(contractPath);
            res.status(200).json({
                status: true,
                message: 'Excel en formato JSON',
                data: jsonContracts
            });
        }
    } catch (err) {
        console.log(err)
        deleteFile(contractPath);
        if (typeof err !== 'object') {
            err = err.toString();
        }
        res.status(400).json({
            errors: err,
            status: false
        });
    }
}

function newRelease(contract, buyer, supplier) {
    const tender = saveTender(contract, buyer);
    const contracts = saveContract(contract);
    const parties = saveParty(supplier, buyer);
    const awards = saveAward(contract, supplier);
    const newRelease = {
        ocid: `${OCID}${contract['NUMERO INTERNO DEL CONTRATO']}`,
        id: `${contract['NUMERO INTERNO DEL CONTRATO']}-contract-01`,
        tag: ['contract'],
        initiationType: 'tender',
        tender,
        parties,
        buyer,
        awards,
        contracts
    };
    return newRelease;
};

function saveContract(contract) {
    const contractItem = {
        id: `contract-01`,
        awardID: `award-01`,
        status: contract['ESTADO DEL PROCESO'].toLowerCase(),
        title: contract['OBJETO DEL CONTRATO'],
        description: contract['OBJETO DEL CONTRATO'],
        period: {
            startDate: dayjs(contract['FECHA DE INICIO DEL CONTRATO']).format(),
            endDate: dayjs(contract['FECHA DE TERMINACION DEL CONTRATO']).format()
        },
        value: {
            amount: contract['VALOR TOTAL DEL CONTRATO (CON ADICIONES)'],
            currency: 'COP'
        },
        dateSigned: dayjs(contract['FECHA FIRMA DEL CONTRATO O CREACION DEL PROCESO']).format()
    };
    return [contractItem];
}

function saveParty(supplier, partyBuyer) {
    const parties = [];
    parties.push({ organizationRef: supplier, roles: ['supplier', 'payee'] });
    parties.push({ organizationRef: partyBuyer, roles: ['procuringEntity', 'buyer', 'payer'] });
    return parties;
}

function saveAward(contract, supplier) {
    const award = {
        id: `award-01`,
        title: contract['OBJETO DEL CONTRATO'],
        date: dayjs(contract['FECHA FIRMA DEL CONTRATO O CREACION DEL PROCESO']).format(),
        description: contract['OBJETO DEL CONTRATO'],
        status: 'active',
        value: {
            amount: contract['VALOR TOTAL DEL CONTRATO (CON ADICIONES)'],
            currency: 'COP'
        },
        suppliers: [supplier]
    };
    return [award];
}

function saveTender(contract, partyBuyer) {
    const tender = {
        id: `tender-01`,
        title: contract['OBJETO DEL CONTRATO'],
        description: contract['OBJETO DEL CONTRATO'],
        procuringEntity: partyBuyer,
        status: 'complete',
        value: {
            amount: contract['VALOR TOTAL DEL CONTRATO (CON ADICIONES)'],
            currency: 'COP'
        },
        procurementMethod: contract['MODALIDAD DE CONTRATACION'].toLowerCase(),
        numberOfTenderers: contract['NUMERO DE PROPONENTES'],
        additionalProcurementCategories: [contract['TIPO DE CONTRATACION'].toLowerCase()],
        submissionMethod: [
            'inPerson',
            'electronicSubmission'
        ]
    };
    return tender;
};

exports.getUsers = (req, res, next) => {
    User.find({}, '-_id -__v', (err, user) => {
        res.json(user)
    });
};

exports.userCanEditRelease = (req, res, next) => {
    Release.findOne(
        { ocid: req.body.ocid })
        .sort('-_id')
        .populate('buyer')
        .exec((err, result) => {
            if (err) {
                return res.status(500).json({ status: false, message: err });
            }
            if (!result) {
                return res.status(200).json({ status: false, message: 'Entrega NO existe' });
            }
            if (!req.user._id.equals(result.buyer.user)) {
                return res.status(401).json({ status: false, message: 'No puede editar esta entrega' });
            }
            next();
        });
};

// Consultas
exports.getReleaseById = async (req, res, next) => {
    const results = await Release.findOne({ id: req.params.id }, '-_id -__v')
        .populate('buyer', '-_id -__v -user')
        .populate('awards.suppliers', '-_id -__v -user')
        .populate('tender.procuringEntity', '-_id -__v -user')
        .populate('parties.organizationRef', '-_id -__v -user')
    // .map(doc => {
    //     if (doc) {
    //         let newDoc = { ...doc };
    //         const parties = newDoc.parties.map(party => {
    //             return {
    //                 ...party.organizationRef,
    //                 roles: party.roles
    //             };
    //         })
    //         newDoc.parties = parties;
    //         return newDoc;
    //     };
    // }).lean()
    res.json({
        status: true,
        message: `Mostrando entrega por Id: ${req.params.id}`,
        data: results
    });
};

exports.getReleaseByOcid = (req, res, next) => {
    const page = req.query.page == null || req.query.page.length == 0 ? 0 : req.query.page;
    const limit = !req.query.limit || req.query.limit.length == 0 || req.query.limit > constants.pageLimit ? constants.pageLimit : parseInt(req.query.limit);
    Release.find({ ocid: req.params.ocid }, '-_id -__v')
        .sort('-_id')
        .skip(page * constants.pageLimit)
        .limit(limit)
        .populate('buyer', '-_id -__v -user')
        .populate('awards.suppliers', '-_id -__v -user')
        .populate('tender.procuringEntity', '-_id -__v -user')
        .populate('parties.organizationRef', '-_id -__v -user')
        .exec((err, results) => {
            if (err) {
                return res.status(500).json({ status: false, message: err });
            };
            res.json({
                status: true,
                message: `Todas las entregas para ocid: ${req.params.ocid}`,
                data: results
            });
        })
    // .lean()
    // .cursor()
    // .map(doc => {
    //     let newDoc = { ...doc };
    //     const parties = newDoc.parties.map(party => {
    //         return {
    //             ...party.organizationRef,
    //             roles: party.roles
    //         };
    //     })
    //     newDoc.parties = parties;
    //     return newDoc;
    // })
    // .on('data', doc => {
    //     results.push(doc)
    // }).
    // on('end', function () {
    //     res.json({
    //         status: true,
    //         message: `Todas las entregas para ocid: ${req.params.ocid}`,
    //         data: results
    //     });
    // });
};

exports.getReleases = async (req, res, next) => {
    const page = req.query.page == null || req.query.page.length == 0 ? 0 : req.query.page;
    const pipeline = [
        { $sort: { _id: -1 } },
        {
            $facet: {
                releases: [
                    { $skip: page * constants.pageLimit },
                    { $limit: constants.pageLimit },
                    ...constants.DOC_POPULATE,
                    { $group: { _id: '$ocid', release: { "$first": "$$ROOT" } } },
                    { $unset: ['release._id', 'release.__v'] }
                ],
                total: [
                    { $group: { _id: '$ocid', release: { "$first": "$$ROOT" } } },
                    { $count: 'total' }
                ]
            }
        }
    ];
    const results = await Release.aggregate(pipeline).cache(constants.queryCacheSeconds);
    res.json({
        status: true,
        message: `Todas las entregas`,
        data: results
    })
};

exports.saveRelease = async (req, res, next) => {
    const release = req.body;
    const isNewRelease = req.url == '/save-release';
    let result = {};
    try {
        result = await validateRelease(release, isNewRelease, req.user._id);
        if (result.errors.length) {
            return res.status(400).json({
                status: false,
                message: 'Asegúrese de que sea una Actualización / Enmienda o una nueva entrega',
                data: result.errors
            });
        };
    } catch (error) {
        return res.status(500).json({
            status: false,
            message: 'Asegúrese de que sea una Actualización / Enmienda o una nueva entrega',
            data: error
        });
    }
    const newRelease = new Release(release);
    newRelease.save()
        .then(release => {
            updateInternalNumbersView();
            cache.clearCache(`${req.user._id}-${release.ocid}`);
            cache.clearCache(`${req.user._id}-buyer`);
            cache.clearCache('totalContracts');
            if (result.partiesToSave.length) {
                organizationReference.insertMany(result.partiesToSave, { ordered: false });
                cache.clearCache('totalParties');
            };
            res.status(201).json({
                status: true,
                message: 'Nueva entrega creada',
                data: release
            });
        })
        .catch(err => {
            if (err.code == 11000) {
                return res.status(400).json({
                    status: false,
                    message: `Ya existe una entrega con este mismo Id: ${release.id}`
                });
            };
            if (typeof err !== 'object') {
                err = err.toString();
            }
            res.status(400).json({ status: false, message: err });
        });
};

async function validateRelease(originalRelease, isNewRelease, userId) {
    const exclusions = ['tag', 'relatedProcesses', 'date', 'initiationType', 'ocid', 'id', 'parties', 'buyer'];
    let release = { ...originalRelease };
    if ('tender' in release) {
        release['tender'] = [release.tender];
    }
    const tags = release.tag;
    let errors = [];
    let partiesToSave = [];
    try {
        const lastRelease = await Release.findOne({ ocid: release.ocid }, '-_id -__v')
            .sort('-_id')
            .populate('buyer', '-_id -__v -user')
            .populate('awards.suppliers', '-_id -__v -user')
            .populate('tender.procuringEntity', '-_id -__v -user')
            .populate('parties.organizationRef', '-_id -__v -user')
            // .map(doc => {
            //     if (doc) {
            //         let newDoc = { ...doc };
            //         const parties = newDoc.parties.map(party => {
            //             return {
            //                 ...party.organizationRef,
            //                 roles: party.roles
            //             };
            //         })
            //         newDoc.parties = parties;
            //         return newDoc;
            //     }
            // })
            .lean().cache(7200, `${userId}-${release.ocid}`);
        if (isNewRelease && lastRelease) {
            errors.push({ error: 'Ya existe una entrega con el mismo ocid', where: 'body' });
            cache.clearCache(`${userId}-${release.ocid}`);
        } else if (!isNewRelease) {
            if (!lastRelease) {
                errors.push({ error: 'Entrega NO existe', where: 'body' });
            } else if (lastRelease.tender.status == 'cancelled' || lastRelease.tender.status == 'unsuccessful') {
                errors.push({ error: 'El estado de la licitación ya se encuentra Cancelada / Sin Éxito', where: 'body' });
            };
        };

        const buyer = await organizationReference.findOne({ user: userId }).cache(7200, `${userId}-buyer`);
        if (!tags.length) {
            return [{ error: 'No hay tags', where: 'tag' }];
        }
        if (tags.filter(tag => tag.match(constants.TAGS.join('|'))).length !== tags.length) {
            return [{ error: 'Hay tags inválidos', where: 'tag' }];
        }
        if (tags.filter((item, index) => tags.indexOf(item) !== index).length) {
            return [{ error: 'Hay tags repetidos', where: 'tag' }];
        }
        let amendUpdateTags = tags.filter(tag => tag.match(/(Update|Amendment|Termination|Cancellation)$/, 'g'));
        let regularTags = tags.filter(tag => tag.match(/^[a-z]+$/, 'g'));
        let newItems = [];
        if (isNewRelease) {
            if (amendUpdateTags.length) {
                return [{ error: 'Esto es una nueva entrega y NO debe haber tags de actualizaciones / Enmiendas' }];
            };
            if (!release.tender) {
                if (!release.planning) {
                    return [{ error: 'Entrega debe contener mínimo la etapa de planeacion u oferta', where: 'body' }];
                }
            };
            for (block of ['tender', 'awards', 'contracts']) {
                if (block in release) {
                    for (const [i, item] of release[block].entries()) {
                        if (Object.keys(item).includes('amendments')) {
                            errors.push({ error: `La nueva entrada no puede tener enmiendas`, where: `[${block}][${i}]` });
                        };
                    };
                };
            };
            let tag;
            for (block of ['planning', 'tender', 'award', 'contract']) {
                if (block in release || block + 's' in release) {
                    tag = block;
                    if (block === 'contract' && release['contracts'].length) {
                        for (item of release['contracts']) {
                            if (Object.keys(item).includes('implementation')) {
                                tag = 'implementation';
                            };
                        };
                    };
                };
            };
            if (regularTags.length > 1 || !regularTags.includes(tag)) {
                errors.push({ error: `Es suficiente con solo especificar el tag: ${tag}`, where: `tag` });
            };
            const errorsParties = await checkParties(originalRelease, isNewRelease, null, partiesToSave);
            const errorsAwardsSuppliers = await checkAwardsSuppliers(originalRelease, partiesToSave);
            errors = errors.concat(errorsAwardsSuppliers, errorsParties);
        } else {
            const releaseToModify = lastRelease;
            regularTags = pluralArray(regularTags);
            amendUpdateTags = pluralArray(amendUpdateTags);
            let changes = diff(originalRelease, releaseToModify);
            let valueChanges = [];
            //console.log(changes)
            if (changes) {
                changes.forEach(change => {
                    if (!exclusions.includes(change.path[0])) {
                        if (change.path.length == 1 || change.path[change.path.length - 1] == 'implementation') {
                            newItems.push(change);
                        } else {
                            valueChanges.push(change);
                        };
                    };
                });
            };
            const errorsParties = await checkParties(originalRelease, isNewRelease, releaseToModify, partiesToSave);
            const errorsAwardsSuppliers = await checkAwardsSuppliers(originalRelease, partiesToSave);
            const checkAmendUpdate = checkChangesAndTags(valueChanges, amendUpdateTags, true);
            const checkNewItems = checkChangesAndTags(newItems, regularTags, false);
            errors = errors.concat(checkAmendUpdate, checkNewItems, errorsParties, errorsAwardsSuppliers);
            // for (tag of ['awards', 'contracts']) {
            //     if (regularTags.includes(tag)) {
            //         const found = newItems.find(i => i.path[0] == tag);
            //         if (!found || !(tag in release) || !release[tag].length) {
            //             errors.push({ error: `El tag especificado no tiene nuevas entradas`, where: tag });
            //         }
            //     }
            // }
            let flags = {
                tender: false,
                contracts: [],
                awards: []
            }
            if (valueChanges.length) {
                for (change of valueChanges) {
                    if ((['awards', 'contracts'].includes(change.path[0])
                        && !flags[change.path[0]].includes(change.path[1]))
                        || (change.path[0] == 'tender' && flags['tender'] == false)) {
                        const blockStatus = checkChanges(release, releaseToModify, change, originalRelease);
                        errors = errors.concat(blockStatus);
                        if (change.path[0] == 'tender') {
                            flags['tender'] = true;
                        } else {
                            flags[change.path[0]].push(change.path[1]);
                        };
                    }
                }
            }
        }
        if (newItems.length) {
            newItems.forEach(newItem => {
                if ('lhs' in newItem) {
                    if (Array.isArray(newItem.lhs)) {
                        for (const [i, item] of newItem.lhs.entries()) {
                            if (newItemHasAmendments(item)) {
                                errors.push({ error: `La nueva entrada no puede tener enmiendas`, where: `[${newItem.path[0]}][${i}]` });
                            };
                        };
                    } else if (newItemHasAmendments(newItem.lhs)) {
                        errors.push({ error: `La nueva entrada no puede tener enmiendas`, where: `[${newItem.path[0]}]` });
                    };
                } else if (newItemHasAmendments(newItem.item.lhs)) {
                    errors.push({ error: `La nueva entrada no puede tener enmiendas`, where: `[${newItem.path[0]}][${newItem.index}]` });
                };

            });
        };
        originalRelease.buyer = buyer;
        if (originalRelease.tender.procuringEntity) {
            if ('id' in originalRelease.tender.procuringEntity) {
                const procuringEntity = await getOrganization(partiesToSave, originalRelease.tender.procuringEntity);
                originalRelease.tender.procuringEntity = procuringEntity;
            } else {
                errors.push({ error: 'El item debe tener mínimo la key "id" si la party ya se encuentra registrada', where: `tender.procuringEntity` });
            };
        } else {
            originalRelease.tender.procuringEntity = buyer;
        };
        for (party of partiesToSave) {
            await party.validate().catch(err => {
                if (err) {
                    errors.push({ error: `Error validando organización. id: ${party.id} name: ${party.name}`, where: err });
                };
            });
        };
    } catch (error) {
        console.log(error)
        errors.push({ error: `Ocurrio un error, asegurate de proporcionar todas las keys/bloques de acuerdo a la etapa del contrato`, where: error });
    }
    return { errors, partiesToSave };
}

const pluralArray = (array) => {
    return array.map(tag => {
        tag = tag.split(/[A-Z]/)[0];
        if (!['tender', 'planning', 'implementation'].includes(tag)) {
            tag += 's';
        }
        return tag;
    });
};

const checkChanges = (release, releaseToModify, block, originalRelease) => {
    let errors = [];
    let changes = diff(release[block.path[0]][block.path[1]], releaseToModify[block.path[0]][block.path[1]]);
    if (change.path.includes('tender')) {
        changes = diff(release[block.path[0]][0], releaseToModify['tender']);
    };
    if (changes) {
        let valueChanges = [];
        let newAmend = [];
        let isIDEdited;
        let amendmentEdited = [];
        changes.forEach(change => {
            if (change.path[0] === 'id') {
                isIDEdited = change;
            }
            if (change.kind == 'E') {
                if (change.path.includes('amendments')) {
                    amendmentEdited.push(change);
                } else {
                    valueChanges.push(change);
                }
            };
            if (change.path.includes('amendments')) {
                if (change.kind == 'D') {
                    newAmend = change.lhs;
                } else if (change.kind == 'A') {
                    newAmend.push(change.item.lhs)
                }
            }
        });
        if (isIDEdited) {
            errors.push({ error: `ID inválido. No se puede modificar`, where: isIDEdited });
        };
        if (!newAmend.length) {
            errors.push({ error: `Existen cambios pero no hay una nueva enmienda.`, where: `[${block.path[0]}][${block.path[1]}]`, changes });
            return errors;
        };
        if (amendmentEdited.length) {
            errors.push({ error: `No se pueden editar las enmiendas anteriores. [${block.path[0]}][${block.path[1]}]`, where: amendmentEdited });
        };
        if (newAmend.length !== 1) {
            errors.push({ error: 'Debe haber SOLO una nueva entrada en las enmiendas', where: `[${block.path[0]}][${block.path[1]}]` });
        };
        if (change.path.includes('tender')) {
            const amendmentsLength = originalRelease['tender'].amendments.length;
            originalRelease['tender'].amendments[amendmentsLength - 1].releaseID = originalRelease.id;
            originalRelease['tender'].amendments[amendmentsLength - 1].amendsReleaseID = releaseToModify.id;
        } else {
            const amendmentsLength = originalRelease[block.path[0]][block.path[1]].amendments.length;
            originalRelease[block.path[0]][block.path[1]].amendments[amendmentsLength - 1].releaseID = originalRelease.id;
            originalRelease[block.path[0]][block.path[1]].amendments[amendmentsLength - 1].amendsReleaseID = releaseToModify.id;
        }
    } else {
        errors.push({ error: 'No existen cambios en el tag especificado', where: `[${block.path[0]}][${block.path[1]}]` });
    }
    return errors;
};

const newItemHasAmendments = obj => {
    return Object.keys(obj).includes('amendments');
};

const checkChangesAndTags = (changes, tags, isAmendUpdate) => {
    let errors = [];
    if (changes.length) {
        changes.forEach(change => {
            if (change.path.includes('implementation')) {
                if (!(tags.includes('implementation'))) {
                    errors.push(messageCheckChangesAndTags(change, isAmendUpdate));
                };
            } else {
                if (!tags.includes(change.path[0])) {
                    errors.push(messageCheckChangesAndTags(change, isAmendUpdate));
                };
            };
        });
    } else if (tags.length) {
        const msg = ((isAmendUpdate) ? 'Existen tags de update/amend pero no hay cambios' : 'No existen nuevos items en los tags especificados');
        errors.push({ error: msg, where: tags });
    };
    return errors;
};

const messageCheckChangesAndTags = (change, isAmendUpdate) => {
    return { error: `Existen cambios en [${change.path.join('][')}] pero no hay un tag de tipo ${((isAmendUpdate) ? 'Update|Amendment|Termination|Cancellation' : 'planning|tender|award|contract|implementation')}`, where: change };
};

const checkParties = async (originalRelease, isNewRelease, releaseToModify, partiesToSave) => {
    const errorsParties = [];
    if ('parties' in originalRelease) {
        if (originalRelease.parties.length !== 0) {
            for (const [i, party] of originalRelease.parties.entries()) {
                if ('id' in party) {
                    if (isNewRelease) {
                        const organization = await getOrganization(partiesToSave, party);
                        originalRelease['parties'][i] = { organizationRef: organization, roles: originalRelease.parties[i].roles };
                    } else {
                        const originalParty = releaseToModify.parties.find(p => p.id === party.id);
                        let changes;
                        if (originalParty) {
                            changes = diff(originalParty, party);
                        };
                        if (changes) {
                            errorsParties.push({ error: 'No es posible modificar las parties', where: `parties[${i}]` });
                        } else if (errorsParties.length == 0) {
                            const organization = await getOrganization(partiesToSave, party);
                            originalRelease['parties'][i] = { organizationRef: organization, roles: originalRelease.parties[i].roles };
                        };
                    };
                } else {
                    errorsParties.push({ error: 'El item debe tener mínimo la key "id" si la party ya se encuentra registrada', where: `parties[${i}]` });
                };
            };
        } else {
            errorsParties.push({ error: 'El bloque Parties está vacío', where: `body` });
        };
    } else {
        errorsParties.push({ error: 'El bloque Parties es requerido', where: `body` });
    };
    return errorsParties;
};

const checkAwardsSuppliers = async (originalRelease, partiesToSave) => {
    const errorsAwardsSuppliers = [];
    if ('awards' in originalRelease) {
        if (originalRelease.awards.length !== 0) {
            for (const [i, award] of originalRelease.awards.entries()) {
                if ('suppliers' in award) {
                    if (award.suppliers.length !== 0) {
                        for (const [j, supplier] of award.suppliers.entries()) {
                            if ('id' in supplier) {
                                const organization = await getOrganization(partiesToSave, supplier);
                                originalRelease['awards'][i].suppliers[j] = organization;
                            } else {
                                errorsAwardsSuppliers.push({ error: 'El item debe tener mínimo la key "id" si la party ya se encuentra registrada', where: `awards[${i}]suppliers[${j}]` });
                            };
                        };
                    } else {
                        errorsAwardsSuppliers.push({ error: 'El bloque Suppliers está vacío', where: `awards[${i}]` });
                    };
                } else {
                    errorsAwardsSuppliers.push({ error: 'El item debe tener la key "suppliers"', where: `awards[${i}]` });
                };
            };
        } else {
            errorsAwardsSuppliers.push({ error: 'El bloque Awards está vacío', where: `body` });
        };
    };
    return errorsAwardsSuppliers;
};

const updateInternalNumbersView = () => {
    mongoConn.db.createCollection(
        'internalNumbers',
        {
            'viewOn': 'releases',
            'pipeline': [
                { $group: { _id: null, ocids: { $addToSet: '$ocid' } } },
                {
                    $project: {
                        ids: {
                            $map: {
                                input: '$ocids',
                                as: 'ocid',
                                'in': {
                                    $arrayElemAt: [
                                        { $split: ['$$ocid', OCID] }, 1
                                    ]
                                }
                            }
                        }
                    }
                }
            ]
        }
    );
};

const getOrganization = async (organizations, party) => {
    let organization = organizations.find(org => org.id == party.id);
    if (!organization) {
        organization = await organizationReference.findOne({ id: party.id });
        if (!organization) {
            organization = new organizationReference(party);
            organizations.push(organization)
        };
    };
    return organization;
};


exports.getContracts = async (req, res) => {
    const pipeline = contractsPipeline(req.query);
    const data = await Release.aggregate(pipeline).cache(constants.queryCacheSeconds);;
    res.json({
        status: true,
        message: `Contratos`,
        data
    })
};

const contractsPipeline = (reqQuery) => {
    const queryTemplate = { page: '', supplier: '', title: '', buyer: '', procurementMethod: '', minAmount: '', maxAmount: '', status: '', startDate: '', endDate: '' };
    const query = Object.assign(queryTemplate, reqQuery);
    query.minAmount = query.minAmount == null || query.minAmount.length == 0 ? 0 : parseInt(query.minAmount);
    query.maxAmount = query.maxAmount == null || query.maxAmount.length == 0 ? Number.MAX_VALUE : parseInt(query.maxAmount);
    query.year = !query.year || query.year.length == 0 ? parseInt(dayjs().format('YYYY')) : parseInt(query.year);
    query.justQuantity = !query.justQuantity || query.justQuantity == 0 ? false : (query.justQuantity == 'true');
    query.status = !query.status || query.status == 0 || !(constants.CONTRACT_STATUS.includes(query.status.toLowerCase())) ? '' : query.status;

    const page = !query.page || query.page.length == 0 ? 0 : query.page;
    const supplierQuery = { $regex: query.supplier + '.*', $options: 'i' };
    const buyerQuery = { $regex: query.buyer + '.*', $options: 'i' };
    const supplierStage = [
        { $unwind: '$release.parties' },
        {
            $match: {
                $and: [
                    {
                        $or: [
                            { 'release.parties.name': supplierQuery },
                            { 'release.parties.identifier.id': supplierQuery }]
                    },
                    { $expr: { $in: ['supplier', '$release.parties.roles'] } }
                ]
            }
        }];
    const buyerStage = {
        $match: {
            $or: [
                { 'release.buyer.name': buyerQuery },
                { 'release.buyer.id': buyerQuery },
                {
                    $and: [
                        {
                            $or: [
                                { 'release.parties.name': buyerQuery },
                                { 'release.parties.identifier.id': buyerQuery }]
                        },
                        { $expr: { $in: ['buyer', '$release.parties.roles'] } }
                    ]
                }
            ],
        }
    };
    const withJustQuantity = query.justQuantity ?
        [{ $sortByCount: '$procurementMethod' }] :
        [{ $skip: page * constants.pageLimit }, { $limit: constants.pageLimit }];
    const pipeline =
        [
            { $sort: { _id: -1 } },
            { $group: { _id: '$ocid', release: { "$first": "$$ROOT" } } },
            //{ $match: { $expr: { $eq: [{ $year: { $dateFromString: { dateString: '$release.date' } } }, query.year] } } },
            { $match: { 'release.tender.procurementMethod': { $regex: query.procurementMethod, $options: 'i' } } },
            ...supplierStage,
            buyerStage,
            { $unwind: { path: '$release.contracts', preserveNullAndEmptyArrays: true } },
            { $match: { 'release.contracts.title': { $regex: query.title + '.*', $options: 'i' } } },
            { $unwind: { path: '$release.awards', preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    $or: [
                        { $expr: { $eq: ['$release.contracts.awardID', '$release.awards.id'] } },
                        { 'release.awards': { $eq: null } }
                    ]
                }
            },
            {
                $match: {
                    $expr: {
                        $and: [
                            {
                                $gte: [
                                    {
                                        $dateFromString: {
                                            dateString: '$release.contracts.period.startDate'
                                        }
                                    },
                                    {
                                        $dateFromString: {
                                            dateString: query.startDate,
                                            format: "%Y-%m-%d",
                                            onNull: '$release.contracts.period.startDate',
                                            onError: '$release.contracts.period.startDate'
                                        }
                                    }
                                ]
                            },
                            {
                                $lte: [
                                    {
                                        $dateFromString: {
                                            dateString: query.endDate,
                                            format: "%Y-%m-%d",
                                            onNull: '$release.contracts.period.endDate',
                                            onError: '$release.contracts.period.endDate'
                                        }
                                    },
                                    {
                                        $dateFromString: {
                                            dateString: '$release.contracts.period.endDate',
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            },
            { $match: { 'release.contracts.status': { $regex: query.status, $options: 'i' } } },
            {
                $match: {
                    $expr: {
                        $and: [
                            { $gte: ['$release.contracts.value.amount', query.minAmount] },
                            { $lte: ['$release.contracts.value.amount', query.maxAmount] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: { ocid: '$_id', contractID: '$release.contracts.id' },
                    contractTitle: { $first: '$release.contracts.title' },
                    status: { $first: '$release.contracts.status' },
                    period: { $first: '$release.contracts.period' },
                    buyer: { $first: '$release.buyer' },
                    suppliers: {
                        $first: {
                            $cond: [
                                { $eq: [{ $type: '$release.awards' }, 'missing'] },
                                '$release.parties', '$release.awards.suppliers'
                            ]
                        }
                    },
                    procurementMethod: { $first: '$release.tender.procurementMethod' },
                    totalContract: { $first: '$release.contracts.value' },
                },

            },
            { $unset: ['buyer.identifier', 'suppliers.identifier'] },
            {
                $facet: {
                    contracts: [
                        ...withJustQuantity
                    ],
                    numberOfContracts: [
                        { $count: 'total' }
                    ]
                }
            }
        ];
    return [...constants.DOC_POPULATE, ...pipeline];
};
