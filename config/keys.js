process.env.PORT = process.env.PORT || 4000;
process.env.NODE_ENV = process.env.NODE_ENV || 'dev';
process.env.SEED = process.env.SEED || 'CaReBoDoQuE';

let urlDB;

if (process.env.NODE_ENV === 'dev') {
    urlDB = 'mongodb://localhost:27017/ocds3';
} else {
    urlDB = process.env.MONGO_URI;
}
process.env.URLDB = urlDB;