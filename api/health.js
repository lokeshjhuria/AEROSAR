const handler = require('../server');
module.exports = (req, res) => handler(req, res, '/health');
