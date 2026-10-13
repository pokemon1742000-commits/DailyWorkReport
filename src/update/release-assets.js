function selectReleaseUpdateAsset(assets, architecture = process.arch) {
    const is32Bit = architecture === 'ia32';
    const downloadableAssets = (Array.isArray(assets) ? assets : [])
        .filter((asset) => asset && asset.browser_download_url);
    const installer = downloadableAssets.find((asset) => {
        const name = String(asset.name || '');
        if (!/setup.*\.exe$/i.test(name)) return false;
        return is32Bit ? /-ia32\.exe$/i.test(name) : !/-ia32\.exe$/i.test(name);
    });
    if (installer) return installer;

    return downloadableAssets.find((asset) => {
        const name = String(asset.name || '');
        if (!/win-unpacked\.zip$/i.test(name)) return false;
        return is32Bit ? /-ia32-win-unpacked\.zip$/i.test(name) : /-x64-win-unpacked\.zip$/i.test(name);
    });
}

function canAutoInstallUpdate({ platform, packaged, portable }) {
    return platform === 'win32' && packaged === true && portable !== true;
}

module.exports = { selectReleaseUpdateAsset, canAutoInstallUpdate };
