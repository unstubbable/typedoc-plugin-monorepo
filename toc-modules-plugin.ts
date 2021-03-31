import { Component } from "typedoc/dist/lib/utils";
import { RendererComponent } from "typedoc/dist/lib/output/components";
import { PageEvent } from "typedoc/dist/lib/output/events";
import {
  Reflection,
  DeclarationReflection,
  ReflectionKind,
  ContainerReflection,
} from "typedoc/dist/lib/models";
import { NavigationItem } from "typedoc/dist/lib/output/models/NavigationItem";

/**
 * A plugin that lists modules as top-level entries in the table of contents for
 * the current page.
 *
 * This plugin overwrites the [[PageEvent.toc]] property.
 */
@Component({ name: "toc-modules" })
export class TocModulesPlugin extends RendererComponent {
  /**
   * Create a new TocModulesPlugin instance.
   */
  initialize() {
    this.listenTo(this.owner, {
      [PageEvent.BEGIN]: this.onRendererBeginPage,
    });
  }

  /**
   * Triggered before a document will be rendered.
   *
   * @param page  An event object describing the current render operation.
   */
  private onRendererBeginPage(page: PageEvent) {
    let model: Reflection = page.model;

    const trail: Reflection[] = [];

    while (model !== page.project) {
      const isModule = model.kindOf && model.kindOf(ReflectionKind.SomeModule);

      trail.unshift(model);

      if (model.parent) {
        model = model.parent;
      }

      if (isModule) {
        break;
      }
    }

    page.toc = new NavigationItem();

    TocModulesPlugin.buildToc(model, trail, page.toc);
  }

  /**
   * Create a toc navigation item structure.
   *
   * @param model   The models whose children should be written to the toc.
   * @param trail   Defines the active trail of expanded toc entries.
   * @param parent  The parent [[NavigationItem]] the toc should be appended to.
   */
  static buildToc(
    model: Reflection,
    trail: Reflection[],
    parent: NavigationItem
  ) {
    const index = trail.indexOf(model);
    const children = (model as ContainerReflection).children || [];

    if (index < trail.length - 1 && children.length > 40) {
      const child = trail[index + 1];
      const item = NavigationItem.create(child, parent, true);

      item.isInPath = true;
      item.isCurrent = false;

      TocModulesPlugin.buildToc(child, trail, item);
    } else {
      children.forEach((child: DeclarationReflection) => {
        const item = NavigationItem.create(child, parent, true);

        if (trail.includes(child)) {
          item.isInPath = true;
          item.isCurrent = trail[trail.length - 1] === child;

          TocModulesPlugin.buildToc(child, trail, item);
        }
      });
    }
  }
}
