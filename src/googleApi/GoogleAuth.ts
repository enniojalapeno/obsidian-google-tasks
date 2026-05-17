import type GoogleTasks from "../GoogleTasksPlugin";
import {
	settingsAreComplete,
	settingsAreCompleteAndLoggedIn,
} from "../view/GoogleTasksSettingTab";
import {
	getAT,
	getET,
	setAT,
	setET,
} from "../helper/LocalStorage";
import { Notice, Platform } from "obsidian";

export async function getGoogleAuthToken(plugin: GoogleTasks): Promise<string | undefined> {
	if (!settingsAreCompleteAndLoggedIn(plugin)) return undefined;

	if (
		getET() == 0 ||
		isNaN(getET()) ||
		getET() < +new Date()
	) {
		const refreshToken = plugin.settings.googleRefreshToken;
		if (refreshToken != "") {
			const refreshBody = {
				client_id: plugin.settings.googleClientId,
				client_secret: plugin.settings.googleClientSecret,
				grant_type: "refresh_token",
				refresh_token: refreshToken,
			};
			const response = await fetch("https://oauth2.googleapis.com/token",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(refreshBody),
				}
			);

			const tokenData = await response.json();

			if (!tokenData.access_token) {
				console.error("Token refresh failed:", tokenData);
				plugin.settings.googleRefreshToken = "";
				await plugin.saveSettings();
				new Notice("Google login expired. Please re-login in settings.");
				return undefined;
			}

			setAT(tokenData.access_token);
			setET(+new Date() + (tokenData.expires_in ?? 3600) * 1000);
		}
	}

	return getAT();
}

export async function LoginGoogle(plugin: GoogleTasks) {
	if (Platform.isDesktop) {
		if (!settingsAreComplete(plugin)) return;
		const { OAuth2Client } = require("google-auth-library");
		const http = require("http");
		const open = require("open");
		const url = require("url");
		const destroyer = require("server-destroy");
		const oAuth2Client = new OAuth2Client(
			plugin.settings.googleClientId,
			plugin.settings.googleClientSecret,
			"http://127.0.0.1:42813/callback"
		);
		const authorizeUrl = oAuth2Client.generateAuthUrl({
			scope: "https://www.googleapis.com/auth/tasks",
			access_type: "offline",
			prompt: "consent"
		});

		const server = http
			.createServer(async (req: any, res: any) => {
				try {
					if (req.url.indexOf("/callback") > -1) {
						const qs = new url.URL(
							req.url,
							"http://localhost:42813"
						).searchParams;
						const code = qs.get("code");
						res.end(
							"Authentication successful! Please return to obsidian."
						);
						server.destroy();

						const r = await oAuth2Client.getToken(code);

						if (r.tokens.refresh_token) {
							plugin.settings.googleRefreshToken = r.tokens.refresh_token;
							await plugin.saveSettings();
						}
						setAT(r.tokens.access_token ?? "");
						setET(r.tokens.expiry_date ?? 0);

						console.info("Tokens acquired.");
					}
				} catch (e) {
					console.error("Error getting Tokens.");
				}
			})
			.listen(42813, () => {
				open(authorizeUrl, { wait: false }).then((cp: any) =>
					cp.unref()
				);
			});

		destroyer(server);
	} else {
		new Notice("Can't use OAuth on this device");
	}
}
