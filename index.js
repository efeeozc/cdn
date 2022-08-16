import express from 'express';
import fileUpload from 'express-fileupload';
import bodyParser from 'body-parser';
import { Database } from 'nukleon';
const metaDb = new Database('./databases/metaDb.json');
const app = express();

function random(x) {
    var length = Number(x)
    var result = ""
    var charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    for (var i = 0, n = charset.length; i < length; ++i) {
        result += `${charset.charAt(Math.floor(Math.random() * n))}`
    }
    return result
}

app.listen(3001);
app.set('view engine', 'ejs');

app.use(express.static('styles'))

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(express.static('uploads'))
app.use(fileUpload())



/* DISCORD OAUTH2 */
import passport from 'passport';
import { Strategy } from 'passport-discord';
import session from 'express-session';
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync('./config.json'));
passport.serializeUser(function(user, done) { done(null, user); });
passport.deserializeUser(function(obj, done) { done(null, obj); });
var scopes = ['identify']; var prompt = 'consent';
passport.use(new Strategy({
    clientID: config.discord.auth.clientId, clientSecret: config.discord.auth.clientSecret,
    callbackURL: `${config.web.domainWithProto}/callback`, scope: scopes, prompt: prompt
}, function(accessToken, refreshToken, profile, done) {
    process.nextTick(function() { return done(null, profile); });
}));
app.use(session({
    secret: config.discord.auth.sessionSecret,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize()); app.use(passport.session());
app.get('/login', passport.authenticate('discord', { scope: scopes, prompt: prompt }), function(req, res) { });
app.get('/callback',
    passport.authenticate('discord', { failureRedirect: "/" }), function(req, res) {
        if (!config.discord.access.members.includes(req.user.id) && !config.discord.access.admins.includes(req.user.id)) {
            res.redirect("/"); req.logout(function(err) { if (err) return res.redirect("/"); });
        } else if (!req.user.username) {
            res.redirect("/"); req.logout(function(err) { if (err) return res.redirect("/"); });
        } else { res.redirect('/upload'); };
    });
app.get('/logout', checkAuth, function(req, res) { req.logout(function(err) { if (err) return res.redirect("/"); }); res.redirect('/upload'); });
function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next(); res.redirect("/");
};
/* DISCORD OAUTH2 */



app.get('/', async (req, res) => {
    res.render('index');
});

app.get('/upload', checkAuth, async (req, res) => {
    res.render('upload', { err: '' });
});

app.post('/upload', checkAuth, async (req, res) => {
    if (!req.files) return res.render('upload', { err: 'Dosya yüklenirken bir hata oluştu. Daha sonra tekrar dene.' });
    const file = req.files.file;
    const fileName = req.body.filename || random(5);
    file.mv(`./uploads/${fileName}.${file.name.split(".").reverse()[0]}`).catch(err => {
        console.log(err);
        res.render('upload', { err: 'Dosya yüklenirken bir hata oluştu. Daha sonra tekrar dene.' });
    });
    metaDb.set(`${fileName}`, `${fileName}.${file.name.split(".").reverse()[0]}`);
    res.redirect(`/success/${fileName}.${file.name.split(".").reverse()[0]}`);
});

app.get('/success/:code', checkAuth, async (req, res) => {
    const code = req.params.code;
    res.render('success', { code: code });
});

app.use(async (req, res) => {
    const requestedCode = req.url.slice(1);
    if (fs.readdirSync('uploads').includes(metaDb.get(requestedCode))) {
        function formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        };
        const file = metaDb.get(requestedCode);
        const { size } = fs.statSync(`uploads/${file}`);
        const fileSize = formatBytes(Number(size));
        res.send(`
<!DOCTYPE html>
<head>
    <!--<meta property="og:site_name" content="Copyright 2022 © Noway Developers"/>-->
    <meta property="og:title" content="${file} / ${fileSize}"/>
    <meta property="og:url" content="/${metaDb.get(requestedCode)}"/>
    <meta property="og:description" content="${config.web.meta.desc}"/>
    <meta property="og:image" content="${config.web.domainWithProto}/${metaDb.get(requestedCode)}"/>
    <!--<meta property="og:video" content="${config.web.domainWithProto}/${metaDb.get(requestedCode)}"/>-->
    <!--<meta name="theme-color" content="#fff"/>-->
    <meta name="twitter:card" content="summary_large_image"/>
    <meta http-equiv="refresh" content="3; url=/${metaDb.get(requestedCode)}"/>
</head>
Redirecting to file source...
`);
    } else res.redirect('/');
});