// Tests never read the developer's ~/.config/awesome-things/config.json: a token or port in it
// would leak into assertions, and an unreadable one would make every test exit.
process.env.AWESOME_THINGS_CONFIG = '/nonexistent/awesome-things-test-config.json';
