import express from "express";
import fs from "fs";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import tls from "tls";
import helmet from "helmet";
import https from "https";
import cors from "cors";

export default function cerfSetAndListen(app: express.Express, certFolderPath: string) {
    const sslFileName = ["kazunami36.com", "medfom.com", "sumwave.net", "miharu.blog", "sumwave28536.com", "repezen.online", "solfa.online"];
    const sslFileDefault = "kazunami36.com";
    function certGet(domain: string) {
        let path;
        for (const filename of sslFileName) if (domain === filename || domain === "www." + filename) path = certFolderPath + "/" + filename.split(".")[0];
        if (!path) path = certFolderPath + "/" + sslFileDefault.split(".")[0];
        return {
            key: String(fs.readFileSync(path + ".key")),
            cert: String(fs.readFileSync(path + ".crt"))
        };
    }
    const options = {
        SNICallback: (domain: string, callback: (err: Error | null, ctx?: tls.SecureContext) => void) => {
            console.log("SNICallback");
            const cert = certGet(domain);
            if (cert) callback(null, tls.createSecureContext(cert));
            else callback(new Error("No SSL certificate found for domain: " + domain));
        },
        key: String(fs.readFileSync(certFolderPath + "/" + sslFileDefault.split(".")[0] + ".key")),
        cert: String(fs.readFileSync(certFolderPath + "/" + sslFileDefault.split(".")[0] + ".crt"))
    };
    const server = https.createServer(options, app);
    server.listen("38671", () => { console.log("listen."); });
    app.use(helmet());
    app.use((req, res, next) => { res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); next(); });
    app.use(bodyParser.urlencoded({ limit: "127gb", extended: true }));
    // app.use(bodyParser.raw({ type: '*/*' }));
    app.use(cookieParser());
    app.use(helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "www.google.com", "www.gstatic.com", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            imgSrc: ["'self'", "cdn.discordapp.com", "david.li"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
            frameSrc: ["'self'", "www.google.com"]
        }
    }));
    app.use(cors({ origin: "*" }));
}
