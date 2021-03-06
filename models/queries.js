var promise = require("bluebird");
var options = { promiseLib: promise };
var pgp = require("pg-promise")(options);
var axios = require("axios");

var connectionString = process.env.DATABASE_URL;
var db = pgp(connectionString);

var insertAuthorOnce = false;
var insertCaptionOnce = false;
var restartEverything = false;

function grabNewGiphyImage(req, res, next) {
    axios.get("http://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC")
        .then((response) => {
            db.none("insert into giphyURL(url)" + "select $1" + "where not exists (select 1 from giphyURL where id = 1)",
                response.data.data.image_url);
            res.locals.gifUrl = response.data.data.image_url;
            return next();

        }).catch((err) => {
            console.log(err);
        });
}

function getImage(req, res, next) {
    db.any("select * from giphyURL where id = 1").then(function(info) {
        if (info[0] === undefined) {
            grabNewGiphyImage(req, res, next);
            return this;
        }

        res.locals.gifUrl = info[0].url;
        return next();
    });
}

function getName(req, res, next) {
    if (req.query.author === "" || req.query.author === undefined) {
        req.query.author = 'Anon';
    }

    console.log("CHECKING THIS:", req.query.author);

    if (insertAuthorOnce === false) {
        insertAuthorOnce = true;
        db.none("insert into author(name)" + "values($1)", req.query.author);
    }

    res.render("entry", {
        gifUrl: res.locals.gifUrl,
        authorName: req.query.author
    });
}

function getCaption(req, res, next) {
    if (req.query.caption === "" || req.query.caption === undefined) {
        req.query.caption = 'Drawing a blank here';
    }

    var query = insertCaptionOnce === false ? "insert into caption(sentence)" + "values($1)" :
        "update caption set sentence=$1 where id = 1";
    insertCaptionOnce = true;

    console.log("CHECKING THIS:", req.query.caption);

    db.none(query, req.query.caption).then(function() {
        db.any("SELECT a.name, c.sentence FROM author a FULL JOIN caption c ON c.id = a.id")
            .then(function(info) {
                console.log("Let's go:", info[0]);
                restartEverything = true;

                res.render("results", {
                    gifUrl: res.locals.gifUrl,
                    quoteList: info
                });
            });
    });
}

function resetAll() {
    if (restartEverything === true) {
        insertAuthorOnce = false;
        insertCaptionOnce = false;
        restartEverything = false;
        db.none("truncate table giphyURL, author, caption restart identity");
    }
}

function deleteAll(res, req, next) {
    db.result('delete from author, caption' + "values($1, $2)", req.body);
}

module.exports = {
    resetAll: resetAll,

    getImage: getImage,
    getName: getName,
    getCaption: getCaption,

    deleteAll: deleteAll
};