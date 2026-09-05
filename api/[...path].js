const handler = require('../server');

module.exports = async (request, response) => {
	try {
		return await handler(request, response);
	} catch (error) {
		console.error('AEROSAR serverless function failed:', error);
		if (!response.headersSent) {
			response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
			response.end(JSON.stringify({ error: 'Internal server error.' }));
		}
	}
};