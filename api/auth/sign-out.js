const handler = require('../../dev-server');
module.exports = (req, res) => handler(req, res, '/auth/sign-out');
