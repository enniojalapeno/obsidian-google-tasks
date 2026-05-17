export const getAT = (): string => {
	return window.localStorage.getItem("googleTaskAccessToken") ?? "";
};

export const getET = (): number => {
	const expirationTimeString =
		window.localStorage.getItem("googleTaskExpirationTime") ?? "0";
	return parseInt(expirationTimeString, 10);
};

export const setAT = (googleAccessToken: string) => {
	window.localStorage.setItem("googleTaskAccessToken", googleAccessToken);
};

export const setET = (googleExpirationTime: number) => {
	window.localStorage.setItem(
		"googleTaskExpirationTime",
		googleExpirationTime + ""
	);
};

export const ClearTokens = () => {
	window.localStorage.removeItem("googleTaskAccessToken");
	window.localStorage.removeItem("googleTaskRefreshToken");
	window.localStorage.removeItem("googleTaskExpirationTime");
};
