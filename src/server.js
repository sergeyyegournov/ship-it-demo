const { createApp } = require('./app');

const port = process.env.PORT || 3000;
createApp().listen(port, () => console.log(`status-board listening on ${port}`));
