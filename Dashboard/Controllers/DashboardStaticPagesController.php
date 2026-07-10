<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\StaticPages\Controllers\FwStaticPagesAdminController;
    use PHPCraftdream\Garnet\Bundle\Modules\StaticPages\FwStaticPagesService;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Services\StaticPagesService;
    use PHPCraftdream\IRabi\Dashboard\IrabiDashboardMenuTrait;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    class DashboardStaticPagesController extends FwStaticPagesAdminController {
        use IrabiDashboardMenuTrait;

        public const URL = '/admin/pages/';

        protected static function isAllowed(): bool {
            return UserEntityConfig::isOwner();
        }

        protected static function service(): FwStaticPagesService {
            return new StaticPagesService();
        }

        protected static function uploadDir(): string {
            return IRabi::getInstance()->publicUploadDir . 'pages' . DIRECTORY_SEPARATOR;
        }

        protected static function uploadWebPath(): string {
            return IRabi::getInstance()->publicUploadWebPath . 'pages/';
        }

        protected static function getLabels(): array {
            $t = ForegroundI18n::getInstance();
            return [
                'title' => $t->Admin_Pages_Title(),
                'empty' => $t->Admin_Pages_Empty(),
                'create' => $t->Admin_Pages_Create(),
                'createTitle' => $t->Admin_Pages_CreateTitle(),
                'slug' => $t->Admin_Pages_Slug(),
                'slugHint' => $t->Admin_Pages_SlugHint(),
                'pageTitle' => $t->Admin_Pages_PageTitle(),
                'metaDescription' => $t->Admin_Pages_MetaDescription(),
                'maxWidth' => $t->Admin_Pages_MaxWidth(),
                'visibility' => $t->Admin_Pages_Visibility(),
                'visibilityAll' => $t->Admin_Pages_Visibility_All(),
                'visibilityAuth' => $t->Admin_Pages_Visibility_Auth(),
                'visibilityGuest' => $t->Admin_Pages_Visibility_Guest(),
                'visibilityModerator' => $t->Admin_Pages_Visibility_Moderator(),
                'blockVisibility' => $t->Admin_Pages_BlockVisibility(),
                'published' => $t->Admin_Pages_Published(),
                'draft' => $t->Admin_Pages_Draft(),
                'publish' => $t->Admin_Pages_Publish(),
                'unpublish' => $t->Admin_Pages_Unpublish(),
                'deleteConfirm' => $t->Admin_Pages_DeleteConfirm(),
                'blocks' => $t->Admin_Pages_Blocks(),
                'addBlock' => $t->Admin_Pages_AddBlock(),
                'blockTypeHeading' => $t->Admin_Pages_BlockType_Heading(),
                'blockTypeText' => $t->Admin_Pages_BlockType_Text(),
                'blockTypeImage' => $t->Admin_Pages_BlockType_Image(),
                'blockTypeGallery' => $t->Admin_Pages_BlockType_Gallery(),
                'imageAlt' => $t->Admin_Pages_ImageAlt(),
                'imageLightbox' => $t->Admin_Pages_ImageLightbox(),
                'galleryRows' => $t->Admin_Pages_GalleryRows(),
                'uploadImage' => $t->Admin_Pages_UploadImage(),
                'removeImage' => $t->Admin_Pages_RemoveImage(),
                'blockHidden' => $t->Admin_Pages_BlockHidden(),
                'blockVisible' => $t->Admin_Pages_BlockVisible(),
                'deleteBlockConfirm' => $t->Admin_Pages_DeleteBlockConfirm(),
                'variables' => $t->Admin_Pages_Variables(),
                'moveUp' => $t->Admin_Pages_MoveUp(),
                'moveDown' => $t->Admin_Pages_MoveDown(),
                'openPage' => $t->Admin_Pages_OpenPage(),
                'savePage' => $t->Admin_Pages_SavePage(),
                'editPage' => $t->Admin_Pages_EditPage(),
                'actionDelete' => $t->Action_Delete(),
                'actionCancel' => $t->Action_Cancel(),
                'actionClose' => $t->Action_Close(),
                'error' => $t->General_Error(),
                // Snippets labels
                'snippets' => $t->Admin_Snippets(),
                'snippetsEmpty' => $t->Admin_Snippets_Empty(),
                'snippetsCreate' => $t->Admin_Snippets_Create(),
                'snippetsCreateTitle' => $t->Admin_Snippets_CreateTitle(),
                'snippetsName' => $t->Admin_Snippets_Name(),
                'snippetsSlug' => $t->Admin_Snippets_Slug(),
                'snippetsType' => $t->Admin_Snippets_Type(),
                'snippetsTypeHeader' => $t->Admin_Snippets_Type_Header(),
                'snippetsTypeFooter' => $t->Admin_Snippets_Type_Footer(),
                'snippetsTypeVariable' => $t->Admin_Snippets_Type_Variable(),
                'snippetsTypeBlock' => $t->Admin_Snippets_Type_Block(),
                'snippetsActive' => $t->Admin_Snippets_Active(),
                'snippetsInactive' => $t->Admin_Snippets_Inactive(),
                'snippetsDeleteConfirm' => $t->Admin_Snippets_DeleteConfirm(),
                'snippetsUsageHint' => $t->Admin_Snippets_UsageHint(),
                'snippetsEditTitle' => $t->Admin_Snippets_EditTitle(),
                'headerSnippet' => $t->Admin_Pages_HeaderSnippet(),
                'footerSnippet' => $t->Admin_Pages_FooterSnippet(),
                'noSnippet' => $t->Admin_Pages_NoSnippet(),
                'snippetsFilterAll' => $t->Admin_Snippets_FilterAll(),
                // Structured snippet editor labels
                'snippetsLogo' => $t->Admin_Snippets_Logo(),
                'snippetsLogoAlt' => $t->Admin_Snippets_LogoAlt(),
                'snippetsLogoLink' => $t->Admin_Snippets_LogoLink(),
                'snippetsLogoHeight' => $t->Admin_Snippets_LogoHeight(),
                'snippetsMenuItems' => $t->Admin_Snippets_MenuItems(),
                'snippetsAddItem' => $t->Admin_Snippets_AddItem(),
                'snippetsItemTypeLink' => $t->Admin_Snippets_ItemType_Link(),
                'snippetsItemTypePage' => $t->Admin_Snippets_ItemType_Page(),
                'snippetsItemTypeDivider' => $t->Admin_Snippets_ItemType_Divider(),
                'snippetsItemLabel' => $t->Admin_Snippets_ItemLabel(),
                'snippetsItemUrl' => $t->Admin_Snippets_ItemUrl(),
                'snippetsItemExternal' => $t->Admin_Snippets_ItemExternal(),
                'snippetsLayout' => $t->Admin_Snippets_Layout(),
                'snippetsLayoutLeft' => $t->Admin_Snippets_Layout_Left(),
                'snippetsLayoutCenter' => $t->Admin_Snippets_Layout_Center(),
                'snippetsLayoutMinimal' => $t->Admin_Snippets_Layout_Minimal(),
                'snippetsSticky' => $t->Admin_Snippets_Sticky(),
                'snippetsColumns' => $t->Admin_Snippets_Columns(),
                'snippetsAddColumn' => $t->Admin_Snippets_AddColumn(),
                'snippetsColumnTitle' => $t->Admin_Snippets_ColumnTitle(),
                'snippetsCopyright' => $t->Admin_Snippets_Copyright(),
                'snippetsLayoutColumns' => $t->Admin_Snippets_Layout_Columns(),
                'snippetsLayoutSimple' => $t->Admin_Snippets_Layout_Simple(),
                'snippetsRemoveColumn' => $t->Admin_Snippets_RemoveColumn(),
                'snippetsSelectPage' => $t->Admin_Snippets_SelectPage(),
            ];
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isAllowed()) {
                return ControllerTools::redirect(IRabi::url('/'));
            }
            $url = $globals->getUri();
            $baseUrl = IRabi::url(static::URL);

            $content = RenderIsland::render('admin-static-pages', [
                'listUrl' => $baseUrl . '~list',
                'createUrl' => $baseUrl . '~create',
                'updateUrl' => $baseUrl . '~update',
                'deleteUrl' => $baseUrl . '~delete',
                'blocksUrl' => $baseUrl . '~blocks',
                'addBlockUrl' => $baseUrl . '~addBlock',
                'updateBlockUrl' => $baseUrl . '~updateBlock',
                'deleteBlockUrl' => $baseUrl . '~deleteBlock',
                'reorderBlocksUrl' => $baseUrl . '~reorderBlocks',
                'saveBlocksUrl' => $baseUrl . '~saveBlocks',
                'variablesUrl' => $baseUrl . '~variables',
                'uploadImageUrl' => $baseUrl . '~uploadImage',
                'deleteImageUrl' => $baseUrl . '~deleteImage',
                'snippetsListUrl' => $baseUrl . '~snippetsList',
                'snippetCreateUrl' => $baseUrl . '~snippetCreate',
                'snippetUpdateUrl' => $baseUrl . '~snippetUpdate',
                'snippetDeleteUrl' => $baseUrl . '~snippetDelete',
                'headerFooterSnippetsUrl' => $baseUrl . '~headerFooterSnippets',
                'publicBaseUrl' => IRabi::url('/page/view~'),
                'labels' => static::getLabels(),
            ]);

            return ControllerTools::ok(HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => static::getMainMenu($url),
                    'side_menu_items' => static::getSideMenu($url),
                ])
            ));
        }
    }
}
