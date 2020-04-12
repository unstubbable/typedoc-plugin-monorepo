import path from "path";
import fs from "fs";

import { Reflection } from "typedoc/dist/lib/models/reflections/abstract";
import {
  Component,
  ConverterComponent
} from "typedoc/dist/lib/converter/components";
import { Converter } from "typedoc/dist/lib/converter/converter";
import { Context } from "typedoc/dist/lib/converter/context";
import { CommentPlugin } from "typedoc/dist/lib/converter/plugins/CommentPlugin";
import { Comment } from "typedoc/dist/lib/models/comments";
import { ContainerReflection } from "typedoc/dist/lib/models/reflections/container";
import { Options } from "typedoc/dist/lib/utils/options";

interface ModuleRename {
  renameTo: string;
  reflection: ContainerReflection;
}

/**
 * This plugin allows you to provide a mapping regexp between your source folder structure, and the module that should be
 * reported in typedoc. It will match the first capture group of your regex and use that as the module name.
 *
 * Based on https://github.com/christopherthielen/typedoc-plugin-external-module-name
 *
 *
 */
@Component({ name: "external-module-map" })
export class ExternalModuleMapPlugin extends ConverterComponent {
  /** List of module reflections which are models to rename */
  private moduleRenames: ModuleRename[];
  private mapRegEx: RegExp;
  private isMappingEnabled: boolean;
  private options: Options;
  private modules: Set<string>;

  initialize() {
    this.modules = new Set();
    this.options = this.application.options;
    this.listenTo(this.owner, {
      [Converter.EVENT_BEGIN]: this.onBegin,
      [Converter.EVENT_CREATE_DECLARATION]: this.onDeclarationBegin,
      [Converter.EVENT_RESOLVE_BEGIN]: this.onBeginResolve
    });
  }

  /**
   * Triggered when the converter begins converting a project.
   */
  private onBegin() {
    this.moduleRenames = [];

    const externalmap = this.options.getValue("external-modulemap");

    if (typeof externalmap === "string") {
      try {
        console.log(
          "INFO: applying regexp ",
          externalmap,
          " to calculate module names"
        );
        this.mapRegEx = new RegExp(externalmap);
        this.isMappingEnabled = true;
        console.log("INFO: Enabled", this.isMappingEnabled);
      } catch (e) {
        console.log("WARN: external map not recognized. Not processing.", e);
      }
    }
  }

  private onDeclarationBegin(context: Context, reflection: Reflection, node?) {
    if (!node || !this.isMappingEnabled) return;
    var fileName = node.fileName;
    let match = this.mapRegEx.exec(fileName);
    /*

    */
    if (null != match) {
      console.log(" Mapping ", fileName, " ==> ", match[1]);
      this.modules.add(match[1]);
      this.moduleRenames.push({
        renameTo: match[1],
        reflection: <ContainerReflection>reflection
      });
    }
  }

  /**
   * Triggered when the converter begins resolving a project.
   *
   * @param context  The context object describing the current state the converter is in.
   */
  private onBeginResolve(context: Context) {
    let projRefs = context.project.reflections;
    let refsArray: Reflection[] = Object.keys(projRefs).reduce((m, k) => {
      m.push(projRefs[k]);
      return m;
    }, []);

    // Process each rename
    this.moduleRenames.forEach(item => {
      let renaming = <ContainerReflection>item.reflection;
      // Find an existing module that already has the "rename to" name.  Use it as the merge target.
      let mergeTarget = <ContainerReflection>(
        refsArray.filter(
          ref => ref.kind === renaming.kind && ref.name === item.renameTo
        )[0]
      );

      // If there wasn't a merge target, just change the name of the current module and exit.
      if (!mergeTarget) {
        renaming.name = item.renameTo;
        return;
      }

      if (!mergeTarget.children) {
        mergeTarget.children = [];
      }

      // Since there is a merge target, relocate all the renaming module's children to the mergeTarget.
      let childrenOfRenamed = refsArray.filter(ref => ref.parent === renaming);
      childrenOfRenamed.forEach((ref: Reflection) => {
        // update links in both directions

        //console.log(' merging ', mergeTarget, ref);
        ref.parent = mergeTarget;
        mergeTarget.children.push(<any>ref);
      });

      // Now that all the children have been relocated to the mergeTarget, delete the empty module
      // Make sure the module being renamed doesn't have children, or they will be deleted
      if (renaming.children) renaming.children.length = 0;
      context.project.removeReflection(renaming);
    });

    this.modules.forEach((name: string) => {
      let ref = refsArray
        .filter(ref => ref.name === name)
        .find(ref => path.isAbsolute(ref.originalName)) as ContainerReflection;
      let root = ref.originalName.substring(0, ref.originalName.lastIndexOf(name)) + name;
      try {
        // tslint:disable-next-line ban-types
        Object.defineProperty(ref, "kindString", {
          get() {
            return "Package";
          },
          set() {
            return "Package";
          }
        });
        let readme = fs.readFileSync(path.join(root, "README.md"));
        ref.comment = new Comment("", readme.toString());
      } catch (e) {
        console.error(`No README found for module "${name}"`);
      }
    });
  }
}
