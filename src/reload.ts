import * as vscode from 'vscode';

/** User has to confirm if he wants to reload the editor */
export const showConfirmToReloadMessage = (): Promise<boolean> => {
    return new Promise((resolve) => {
        // if the user does not want to see the reload message
        // if (helpers.getThemeConfig('showReloadMessage').globalValue === false) return;

        vscode.window.showInformationMessage('You have to restart VS Code for changes to take effect.', 'Restart', 'Never show again').then((value) => {
            switch (value) {
                case 'Restart':
                    resolve(true);
                    break;

                case 'Never show again':
                    disableReloadMessage();
                    resolve(false);
                    break;

                default:
                    resolve(false);
                    break;
            }
        });
    });
};

/** Disable the reload message in the global settings */
const disableReloadMessage = () => {
    // helpers.setThemeConfig('showReloadMessage', false, true);
};
