module.exports = {
    "Testing important flag setting": browser => {
      browser
        .url(process.env.VUE_DEV_SERVER_URL + '/#/todo')
        .waitForElementVisible("body", 5000)
        .pause(5000)
        .click('#clear-all')
        .pause(2000)
        .setValue('input',['set a todo',browser.Keys.ENTER])
        .pause(2000)
        .assert.elementPresent(".important-flag")
        .assert.elementNotPresent(".red-flag")
        .click('.important-flag')
        .end();
    }
};