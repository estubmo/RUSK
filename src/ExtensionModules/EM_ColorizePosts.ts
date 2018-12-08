import { ExtensionModule } from "./ExtensionModule";
import { SettingType } from "../Configuration/SettingType";
import { PageContext } from "../Context/PageContext";
import { RBKwebPageType } from "../Context/RBKwebPageType";
import { ConfigBuilder } from "../Configuration/ConfigBuilder";
import { ModuleConfiguration } from "../Configuration/ModuleConfiguration";
import { PostInfo } from "../Utility/PostInfo";

/**
 * EM_ColorizePosts - Extension module for colorizing posts on RBKweb.
 * Unread posts are colorized green.
 * Locates a "selectedItem" and colorizes it another color (beige?).
 * User can move selectedItem to next/previous with hotkeys "j" and "k".
 * When landing on a page or moving to next/previous selectedItem, it is scrolled into view
 */

export class ColorizePosts implements ExtensionModule {

    readonly name: string = "Fargelegging av innlegg";
    cfg: ModuleConfiguration;
    currentlySelectedItem: PostInfo = null;
    allPosts: Array<PostInfo> = null;

    pageTypesToRunOn: Array<RBKwebPageType> = [
        RBKwebPageType.RBKweb_FORUM_POSTLIST
    ];

    runBefore: Array<string> = [];
    runAfter: Array<string> = [];

    configSpec = () =>
        ConfigBuilder
            .Define()
            .EnabledByDefault()
            .WithExtensionModuleName(this.name)
            .WithDisplayName(this.name)
            .WithDescription("Denne modulen fargelegger innlegg på RBKweb i henhold til status.")
            .WithConfigOption(opt =>
                opt
                    .WithSettingName("UnreadColorEven")
                    .WithLabel("Farge for uleste tråder (liketallslinjer)")
                    .WithSettingType(SettingType.color)
                    .WithDefaultValue('lightgreen')
                    .AsSharedSetting()
            )
            .WithConfigOption(opt =>
                opt
                    .WithSettingName("UnreadColorOdd")
                    .WithLabel("Farge for uleste tråder (oddetallslinjer)")
                    .WithSettingType(SettingType.color)
                    .WithDefaultValue('lightgreen')
                    .AsSharedSetting()
            )
            .WithConfigOption(opt =>
                opt
                    .WithSettingName("ReadColorEven")
                    .WithLabel("Farge for leste tråder (liketallslinjer)")
                    .WithSettingType(SettingType.color)
                    .WithDefaultValue('white')
                    .AsSharedSetting()
            )
            .WithConfigOption(opt =>
                opt
                    .WithSettingName("ReadColorOdd")
                    .WithLabel("Farge for leste tråder (oddetallslinjer)")
                    .WithSettingType(SettingType.color)
                    .WithDefaultValue('white')
                    .AsSharedSetting()
            )
            .WithConfigOption(opt =>
                opt
                    .WithSettingName("SelectedItemColor")
                    .WithLabel("Farge for valgt tråd")
                    .WithSettingType(SettingType.color)
                    .WithDefaultValue('DDE7C7')
                    .AsSharedSetting()
            )
            .Build();

    init = (config: ModuleConfiguration) => {
        this.cfg = config;
    }

    preprocess = async () => {
        let request = await fetch(chrome.runtime.getURL("data/colorizeThreads.css"));
        let text = await request.text();

        let css = this.hydrateTemplate(text);
        chrome.runtime.sendMessage({ css });
    }

    execute = (context: PageContext) => {
        this.allPosts = PostInfo.GetPostsFromDocument(document);
        this.allPosts.forEach((post, index) => {
            this.tagRows(post, index);
        });

        this.determineSelectedItem(this.allPosts);
        this.setupHotkeys();
    }

    private setupHotkeys(): void {
        // TODO: Dette er ondskap å gjøre her. Må få inn eget hotkey-regime.
        document.addEventListener("keypress", (ev) => {
            if (ev.code == "KeyJ") {
                this.selectNextItem();
            }
            if (ev.code == "KeyK") {
                this.selectPreviousItem();
            }
            if (ev.code == "KeyG") {
                this.cfg.ChangeSetting("UnreadColorEven", "lightgreen");
            }
            if (ev.code == "KeyB") {
                this.cfg.ChangeSetting("UnreadColorEven", "black");
            }
            if (ev.code == "KeyO") {
                this.goUp();
            }
        })
    }

    private selectNextItem() {
        let currentIndex = this.allPosts.indexOf(this.currentlySelectedItem);
        let newIndex = currentIndex + 1;
        if (newIndex >= this.allPosts.length)
            newIndex = 0;
        this.selectNewItem(this.allPosts[newIndex]);
    }

    private selectPreviousItem() {
        let currentIndex = this.allPosts.indexOf(this.currentlySelectedItem);
        let newIndex = currentIndex - 1;
        if (newIndex < 0)
            newIndex = this.allPosts.length - 1;
        this.selectNewItem(this.allPosts[newIndex]);
    }

    private goUp() {
        window.location.href = (document
            .querySelector(
                'body > table:nth-child(3) > tbody > tr:nth-child(2) > td:nth-child(4) > table > tbody > tr > td > font > p:nth-child(3) > table:nth-child(3) > tbody > tr > td:nth-child(2) > span > a:nth-child(2)'
            ) as HTMLAnchorElement).href;
    }

    private determineSelectedItem(posts: Array<PostInfo>): void {
        if (posts.length == 0) return;

        for (let i = 0; i < posts.length; i++) {
            if (posts[i].isUnread) {
                this.selectNewItem(posts[i]);
                return;
            }
        }

        this.selectNewItem(posts[posts.length-1]);
    }

    private selectNewItem(newItem: PostInfo) {
        if (this.currentlySelectedItem != null) {
            this.currentlySelectedItem.rowElement.classList.remove("RUSKSelectedItem");
        }

        newItem.rowElement.classList.add("RUSKSelectedItem");
        this.currentlySelectedItem = newItem;
        (newItem.rowElement.previousElementSibling as HTMLTableRowElement).scrollIntoView();
        (newItem.rowElement.nextElementSibling as HTMLTableRowElement).scrollIntoView();
        newItem.rowElement.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" });
    }

    private hydrateTemplate(template: string): string {
        let keys = [], values = [];
        keys.push("$RUSKUnreadItem$");
        values.push(this.getConfigItem('UnreadColorEven'));

        for (let i = 0; i < keys.length; i++) {
            template = template.replace(keys[i], values[i]);
        }

        return template;
    }

    private getConfigItem(setting: string): string {
        for (let i = 0; i < this.cfg.settings.length; i++) {
            if (this.cfg.settings[i].setting == setting) {
                return this.cfg.settings[i].value as string;
            }
        }
    }

    private tagRows(post: PostInfo, index: number): void {
        let row = post.rowElement;

        row.classList.add('RUSKItem');

        if (post.isUnread) {
            row.classList.add('RUSKUnreadItem');
        }
        if (index % 2 == 0) {
            row.classList.add('RUSKEvenRowItem');
        } else {
            row.classList.add('RUSKOddRowItem');
        }
    }
}
