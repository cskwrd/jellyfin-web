import dom from 'dom';
import loading from 'loading';
import appHost from 'apphost';
import dialogHelper from 'dialogHelper';
import connectionManager from 'connectionManager';
import imageLoader from 'imageLoader';
import browser from 'browser';
import layoutManager from 'layoutManager';
import scrollHelper from 'scrollHelper';
import globalize from 'globalize';
import require from 'require';
import 'emby-checkbox';
import 'paper-icon-button-light';
import 'emby-button';
import 'formDialogStyle';
import 'cardStyle';

/* eslint-disable indent */

    const enableFocusTransform = !browser.slow && !browser.edge;

    let currentItemId;
    let currentItemType;
    let currentResolve;
    let currentReject;
    let hasChanges = false;

    // These images can be large and we're seeing memory problems in safari
    const browsableImagePageSize = browser.slow ? 6 : 30;

    let browsableImageStartIndex = 0;
    let browsableImageType = 'Primary';
    let selectedProvider;

    function getBaseRemoteOptions() {
        const options = {};

        options.itemId = currentItemId;

        return options;
    }

    function reloadBrowsableImages(page, apiClient) {
        loading.show();

        const options = getBaseRemoteOptions();

        options.type = browsableImageType;
        options.startIndex = browsableImageStartIndex;
        options.limit = browsableImagePageSize;
        options.IncludeAllLanguages = page.querySelector('#chkAllLanguages').checked;

        const provider = selectedProvider || '';

        if (provider) {
            options.ProviderName = provider;
        }

        apiClient.getAvailableRemoteImages(options).then(function (result) {
            renderRemoteImages(page, apiClient, result, browsableImageType, options.startIndex, options.limit);

            page.querySelector('#selectBrowsableImageType').value = browsableImageType;

            const providersHtml = result.Providers.map(function (p) {
                return '<option value="' + p + '">' + p + '</option>';
            });

            const selectImageProvider = page.querySelector('#selectImageProvider');
            selectImageProvider.innerHTML = '<option value="">' + globalize.translate('All') + '</option>' + providersHtml;
            selectImageProvider.value = provider;

            loading.hide();
        });
    }

    function renderRemoteImages(page, apiClient, imagesResult, imageType, startIndex, limit) {
        page.querySelector('.availableImagesPaging').innerHTML = getPagingHtml(startIndex, limit, imagesResult.TotalRecordCount);

        let html = '';

        for (let i = 0, length = imagesResult.Images.length; i < length; i++) {
            html += getRemoteImageHtml(imagesResult.Images[i], imageType, apiClient);
        }

        const availableImagesList = page.querySelector('.availableImagesList');
        availableImagesList.innerHTML = html;
        imageLoader.lazyChildren(availableImagesList);

        const btnNextPage = page.querySelector('.btnNextPage');
        const btnPreviousPage = page.querySelector('.btnPreviousPage');

        if (btnNextPage) {
            btnNextPage.addEventListener('click', function () {
                browsableImageStartIndex += browsableImagePageSize;
                reloadBrowsableImages(page, apiClient);
            });
        }

        if (btnPreviousPage) {
            btnPreviousPage.addEventListener('click', function () {
                browsableImageStartIndex -= browsableImagePageSize;
                reloadBrowsableImages(page, apiClient);
            });
        }
    }

    function getPagingHtml(startIndex, limit, totalRecordCount) {
        let html = '';

        const recordsEnd = Math.min(startIndex + limit, totalRecordCount);

        // 20 is the minimum page size
        const showControls = totalRecordCount > limit;

        html += '<div class="listPaging">';

        html += '<span style="margin-right: 10px;">';

        const startAtDisplay = totalRecordCount ? startIndex + 1 : 0;
        html += globalize.translate('ListPaging', startAtDisplay, recordsEnd, totalRecordCount);

        html += '</span>';

        if (showControls) {
            html += '<div data-role="controlgroup" data-type="horizontal" style="display:inline-block;">';

            html += '<button is="paper-icon-button-light" title="' + globalize.translate('Previous') + '" class="btnPreviousPage autoSize" ' + (startIndex ? '' : 'disabled') + '><span class="material-icons arrow_back"></span></button>';
            html += '<button is="paper-icon-button-light" title="' + globalize.translate('Next') + '" class="btnNextPage autoSize" ' + (startIndex + limit >= totalRecordCount ? 'disabled' : '') + '><span class="material-icons arrow_forward"></span></button>';
            html += '</div>';
        }

        html += '</div>';

        return html;
    }

    function downloadRemoteImage(page, apiClient, url, type, provider) {
        const options = getBaseRemoteOptions();

        options.Type = type;
        options.ImageUrl = url;
        options.ProviderName = provider;

        loading.show();

        apiClient.downloadRemoteImage(options).then(function () {
            hasChanges = true;
            const dlg = dom.parentWithClass(page, 'dialog');
            dialogHelper.close(dlg);
        });
    }

    function getDisplayUrl(url, apiClient) {
        return apiClient.getUrl('Images/Remote', { imageUrl: url });
    }

    function getRemoteImageHtml(image, imageType, apiClient) {
        const tagName = layoutManager.tv ? 'button' : 'div';
        const enableFooterButtons = !layoutManager.tv;

        // TODO move card creation code to Card component

        let html = '';

        let cssClass = 'card scalableCard imageEditorCard';
        const cardBoxCssClass = 'cardBox visualCardBox';

        let shape;
        if (imageType === 'Backdrop' || imageType === 'Art' || imageType === 'Thumb' || imageType === 'Logo') {
            shape = 'backdrop';
        } else if (imageType === 'Banner') {
            shape = 'banner';
        } else if (imageType === 'Disc') {
            shape = 'square';
        } else {
            if (currentItemType === 'Episode') {
                shape = 'backdrop';
            } else if (currentItemType === 'MusicAlbum' || currentItemType === 'MusicArtist') {
                shape = 'square';
            } else {
                shape = 'portrait';
            }
        }

        cssClass += ' ' + shape + 'Card ' + shape + 'Card-scalable';
        if (tagName === 'button') {
            cssClass += ' btnImageCard';

            if (layoutManager.tv) {
                cssClass += ' show-focus';

                if (enableFocusTransform) {
                    cssClass += ' show-animation';
                }
            }

            html += '<button type="button" class="' + cssClass + '"';
        } else {
            html += '<div class="' + cssClass + '"';
        }

        html += ' data-imageprovider="' + image.ProviderName + '" data-imageurl="' + image.Url + '" data-imagetype="' + image.Type + '"';

        html += '>';

        html += '<div class="' + cardBoxCssClass + '">';
        html += '<div class="cardScalable visualCardBox-cardScalable" style="background-color:transparent;">';
        html += '<div class="cardPadder-' + shape + '"></div>';
        html += '<div class="cardContent">';

        if (layoutManager.tv || !appHost.supports('externallinks')) {
            html += '<div class="cardImageContainer lazy" data-src="' + getDisplayUrl(image.Url, apiClient) + '" style="background-position:center center;background-size:contain;"></div>';
        } else {
            html += '<a is="emby-linkbutton" target="_blank" href="' + getDisplayUrl(image.Url, apiClient) + '" class="button-link cardImageContainer lazy" data-src="' + getDisplayUrl(image.Url, apiClient) + '" style="background-position:center center;background-size:contain"></a>';
        }

        html += '</div>';
        html += '</div>';

        // begin footer
        html += '<div class="cardFooter visualCardBox-cardFooter">';

        html += '<div class="cardText cardTextCentered">' + image.ProviderName + '</div>';

        if (image.Width || image.Height || image.Language) {
            html += '<div class="cardText cardText-secondary cardTextCentered">';

            if (image.Width && image.Height) {
                html += image.Width + ' x ' + image.Height;

                if (image.Language) {
                    html += ' • ' + image.Language;
                }
            } else {
                if (image.Language) {
                    html += image.Language;
                }
            }

            html += '</div>';
        }

        if (image.CommunityRating != null) {
            html += '<div class="cardText cardText-secondary cardTextCentered">';

            if (image.RatingType === 'Likes') {
                html += image.CommunityRating + (image.CommunityRating === 1 ? ' like' : ' likes');
            } else {
                if (image.CommunityRating) {
                    html += image.CommunityRating.toFixed(1);

                    if (image.VoteCount) {
                        html += ' • ' + image.VoteCount + (image.VoteCount === 1 ? ' vote' : ' votes');
                    }
                } else {
                    html += 'Unrated';
                }
            }

            html += '</div>';
        }

        if (enableFooterButtons) {
            html += '<div class="cardText cardTextCentered">';

            html += '<button is="paper-icon-button-light" class="btnDownloadRemoteImage autoSize" raised" title="' + globalize.translate('Download') + '"><span class="material-icons cloud_download"></span></button>';
            html += '</div>';
        }

        html += '</div>';
        // end footer

        html += '</div>';

        html += '</' + tagName + '>';

        return html;
    }

    function initEditor(page, apiClient) {
        page.querySelector('#selectBrowsableImageType').addEventListener('change', function () {
            browsableImageType = this.value;
            browsableImageStartIndex = 0;
            selectedProvider = null;

            reloadBrowsableImages(page, apiClient);
        });

        page.querySelector('#selectImageProvider').addEventListener('change', function () {
            browsableImageStartIndex = 0;
            selectedProvider = this.value;

            reloadBrowsableImages(page, apiClient);
        });

        page.querySelector('#chkAllLanguages').addEventListener('change', function () {
            browsableImageStartIndex = 0;

            reloadBrowsableImages(page, apiClient);
        });

        page.addEventListener('click', function (e) {
            const btnDownloadRemoteImage = dom.parentWithClass(e.target, 'btnDownloadRemoteImage');
            if (btnDownloadRemoteImage) {
                const card = dom.parentWithClass(btnDownloadRemoteImage, 'card');
                downloadRemoteImage(page, apiClient, card.getAttribute('data-imageurl'), card.getAttribute('data-imagetype'), card.getAttribute('data-imageprovider'));
                return;
            }

            const btnImageCard = dom.parentWithClass(e.target, 'btnImageCard');
            if (btnImageCard) {
                downloadRemoteImage(page, apiClient, btnImageCard.getAttribute('data-imageurl'), btnImageCard.getAttribute('data-imagetype'), btnImageCard.getAttribute('data-imageprovider'));
            }
        });
    }

    function showEditor(itemId, serverId, itemType) {
        loading.show();

        import('text!./imageDownloader.template.html').then(({default: template}) => {
            const apiClient = connectionManager.getApiClient(serverId);

            currentItemId = itemId;
            currentItemType = itemType;

            const dialogOptions = {
                removeOnClose: true
            };

            if (layoutManager.tv) {
                dialogOptions.size = 'fullscreen';
            } else {
                dialogOptions.size = 'small';
            }

            const dlg = dialogHelper.createDialog(dialogOptions);

            dlg.innerHTML = globalize.translateHtml(template, 'core');

            if (layoutManager.tv) {
                scrollHelper.centerFocus.on(dlg, false);
            }

            // Has to be assigned a z-index after the call to .open()
            dlg.addEventListener('close', onDialogClosed);

            dialogHelper.open(dlg);

            const editorContent = dlg.querySelector('.formDialogContent');
            initEditor(editorContent, apiClient);

            dlg.querySelector('.btnCancel').addEventListener('click', function () {
                dialogHelper.close(dlg);
            });

            reloadBrowsableImages(editorContent, apiClient);
        });
    }

    function onDialogClosed() {
        const dlg = this;

        if (layoutManager.tv) {
            scrollHelper.centerFocus.off(dlg, false);
        }

        loading.hide();
        if (hasChanges) {
            currentResolve();
        } else {
            currentReject();
        }
    }

export function show(itemId, serverId, itemType, imageType) {
    return new Promise(function (resolve, reject) {
        currentResolve = resolve;
        currentReject = reject;
        hasChanges = false;
        browsableImageStartIndex = 0;
        browsableImageType = imageType || 'Primary';
        selectedProvider = null;
        showEditor(itemId, serverId, itemType);
    });
}

export default {
    show: show
};

/* eslint-enable indent */
