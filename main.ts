import { Plugin } from "obsidian";
import { ArticleSuggest } from "./components/suggester";
import { patchDefaultSuggester } from "./utils/suggester-patcher";
import { ApiService } from "./utils/api";

export default class IdealogsPlugin extends Plugin {
  private articleSuggest: ArticleSuggest;
  private apiService: ApiService;

  async onload() {
    this.apiService = new ApiService();
    this.articleSuggest = new ArticleSuggest(this, this.apiService);
    this.registerEditorSuggest(this.articleSuggest);

    patchDefaultSuggester(this.app);
  }
}
