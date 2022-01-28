/**
* DO NOT EDIT THIS FILE.
* See the following change record for more information,
* https://www.drupal.org/node/2815083
* @preserve
**/

((Drupal, debounce, CKEditor5, $) => {
  Drupal.CKEditor5Instances = new Map();
  const callbacks = new Map();
  const required = new Set();

  function findFunc(scope, name) {
    if (!scope) {
      return null;
    }

    const parts = name.includes('.') ? name.split('.') : name;

    if (parts.length > 1) {
      return findFunc(scope[parts.shift()], parts);
    }

    return typeof scope[parts[0]] === 'function' ? scope[parts[0]] : null;
  }

  function buildFunc(config) {
    const {
      func
    } = config;
    const fn = findFunc(window, func.name);

    if (typeof fn === 'function') {
      const result = func.invoke ? fn(...func.args) : fn;
      return result;
    }

    return null;
  }

  function buildRegexp(config) {
    const {
      pattern
    } = config.regexp;
    const main = pattern.match(/\/(.+)\/.*/)[1];
    const options = pattern.match(/\/.+\/(.*)/)[1];
    return new RegExp(main, options);
  }

  function processConfig(config) {
    function processArray(config) {
      return config.map(item => {
        if (typeof item === 'object') {
          return processConfig(item);
        }

        return item;
      });
    }

    return Object.entries(config).reduce((processed, [key, value]) => {
      if (typeof value === 'object') {
        if (value.hasOwnProperty('func')) {
          processed[key] = buildFunc(value);
        } else if (value.hasOwnProperty('regexp')) {
          processed[key] = buildRegexp(value);
        } else if (Array.isArray(value)) {
          processed[key] = processArray(value);
        } else {
          processed[key] = processConfig(value);
        }
      } else {
        processed[key] = value;
      }

      return processed;
    }, {});
  }

  const setElementId = element => {
    const id = Math.random().toString().slice(2, 9);
    element.setAttribute('data-ckeditor5-id', id);
    return id;
  };

  const getElementId = element => element.getAttribute('data-ckeditor5-id');

  function selectPlugins(plugins) {
    return plugins.map(pluginDefinition => {
      const [build, name] = pluginDefinition.split('.');

      if (CKEditor5[build] && CKEditor5[build][name]) {
        return CKEditor5[build][name];
      }

      console.warn(`Failed to load ${build} - ${name}`);
      return null;
    });
  }

  const offCanvasCss = element => {
    element.parentNode.setAttribute('data-drupal-ck-style-fence', true);

    if (!document.querySelector('#ckeditor5-off-canvas-reset')) {
      const prefix = `#drupal-off-canvas [data-drupal-ck-style-fence]`;
      let existingCss = '';
      [...document.styleSheets].forEach(sheet => {
        if (!sheet.href || sheet.href && sheet.href.indexOf('off-canvas') === -1) {
          try {
            const rules = sheet.cssRules;
            [...rules].forEach(rule => {
              let {
                cssText
              } = rule;
              const selector = rule.cssText.split('{')[0];
              cssText = cssText.replace(selector, selector.replace(/,/g, `, ${prefix}`));
              existingCss += `${prefix} ${cssText}`;
            });
          } catch (e) {
            console.warn(`Stylesheet ${sheet.href} not included in CKEditor reset due to the browser's CORS policy.`);
          }
        }
      });
      const addedCss = [`${prefix} .ck.ck-content {display:block;min-height:5rem;}`, `${prefix} .ck.ck-content * {display:initial;background:initial;color:initial;padding:initial;}`, `${prefix} .ck.ck-content li {display:list-item}`, `${prefix} .ck.ck-content ol li {list-style-type: decimal}`, `${prefix} .ck[contenteditable], ${prefix} .ck[contenteditable] * {-webkit-user-modify: read-write;-moz-user-modify: read-write;}`];
      const blockSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ol', 'ul', 'address', 'article', 'aside', 'blockquote', 'body', 'dd', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'header', 'hgroup', 'hr', 'html', 'legend', 'main', 'menu', 'pre', 'section', 'xmp'].map(blockElement => `${prefix} .ck.ck-content ${blockElement}`).join(', \n');
      const blockCss = `${blockSelectors} { display: block; }`;
      const prefixedCss = [...addedCss, existingCss, blockCss].join('\n');
      const offCanvasCss = document.createElement('style');
      offCanvasCss.innerHTML = prefixedCss;
      offCanvasCss.setAttribute('id', 'ckeditor5-off-canvas-reset');
      document.body.appendChild(offCanvasCss);
    }
  };

  Drupal.editors.ckeditor5 = {
    attach(element, format) {
      const {
        editorClassic
      } = CKEditor5;
      const {
        toolbar,
        plugins,
        config: pluginConfig,
        language
      } = format.editorSettings;
      const extraPlugins = selectPlugins(plugins);
      const config = {
        extraPlugins,
        toolbar,
        language,
        ...processConfig(pluginConfig)
      };
      const id = setElementId(element);
      const {
        ClassicEditor
      } = editorClassic;
      ClassicEditor.create(element, config).then(editor => {
        Drupal.CKEditor5Instances.set(id, editor);

        if (element.hasAttribute('required')) {
          required.add(id);
          element.removeAttribute('required');
        }

        $(document).on(`drupalViewportOffsetChange.ckeditor5.${id}`, (event, offsets) => {
          editor.ui.viewportOffset = offsets;
        });
        editor.model.document.on('change:data', () => {
          const callback = callbacks.get(id);

          if (callback) {
            if (editor.plugins.has('SourceEditing')) {
              if (editor.plugins.get('SourceEditing').isSourceEditingMode) {
                callback();
                return;
              }
            }

            debounce(callback, 400)();
          }
        });
        const isOffCanvas = element.closest('#drupal-off-canvas');

        if (isOffCanvas) {
          offCanvasCss(element);
        }
      }).catch(error => {
        console.error(error);
      });
    },

    detach(element, format, trigger) {
      const id = getElementId(element);
      const editor = Drupal.CKEditor5Instances.get(id);

      if (!editor) {
        return;
      }

      $(document).off(`drupalViewportOffsetChange.ckeditor5.${id}`);

      if (trigger === 'serialize') {
        editor.updateSourceElement();
      } else {
        element.removeAttribute('contentEditable');
        let textElement = null;
        let originalValue = null;
        const usingQuickEdit = (((Drupal || {}).quickedit || {}).editors || {}).editor;

        if (usingQuickEdit) {
          Drupal.quickedit.editors.editor.prototype.revert = function revertQuickeditChanges() {
            textElement = this.$textElement[0];
            originalValue = this.model.get('originalValue');
          };
        }

        editor.destroy().then(() => {
          if (textElement && originalValue) {
            textElement.innerHTML = originalValue;
          }

          Drupal.CKEditor5Instances.delete(id);
          callbacks.delete(id);

          if (required.has(id)) {
            element.setAttribute('required', 'required');
            required.delete(id);
          }
        }).catch(error => {
          console.error(error);
        });
      }
    },

    onChange(element, callback) {
      callbacks.set(getElementId(element), callback);
    },

    attachInlineEditor(element, format, mainToolbarId) {
      const {
        editorDecoupled
      } = CKEditor5;
      const {
        toolbar,
        plugins,
        config: pluginConfig,
        language
      } = format.editorSettings;
      const extraPlugins = selectPlugins(plugins);
      const config = {
        extraPlugins,
        toolbar,
        language,
        ...processConfig(pluginConfig)
      };
      const id = setElementId(element);
      const {
        DecoupledEditor
      } = editorDecoupled;
      DecoupledEditor.create(element, config).then(editor => {
        Drupal.CKEditor5Instances.set(id, editor);
        const toolbar = document.getElementById(mainToolbarId);
        toolbar.appendChild(editor.ui.view.toolbar.element);
        editor.model.document.on('change:data', () => {
          const callback = callbacks.get(id);

          if (callback) {
            debounce(callback, 400)(editor.getData());
          }
        });
      }).catch(error => {
        console.error(error);
      });
    }

  };
  Drupal.ckeditor5 = {
    saveCallback: null,

    openDialog(url, saveCallback, dialogSettings) {
      const classes = dialogSettings.dialogClass ? dialogSettings.dialogClass.split(' ') : [];
      classes.push('ui-dialog--narrow');
      dialogSettings.dialogClass = classes.join(' ');
      dialogSettings.autoResize = window.matchMedia('(min-width: 600px)').matches;
      dialogSettings.width = 'auto';
      const ckeditorAjaxDialog = Drupal.ajax({
        dialog: dialogSettings,
        dialogType: 'modal',
        selector: '.ckeditor5-dialog-loading-link',
        url,
        progress: {
          type: 'fullscreen'
        },
        submit: {
          editor_object: {}
        }
      });
      ckeditorAjaxDialog.execute();
      Drupal.ckeditor5.saveCallback = saveCallback;
    }

  };

  function redirectTextareaFragmentToCKEditor5Instance() {
    const hash = window.location.hash.substr(1);
    const element = document.getElementById(hash);

    if (element) {
      const editorID = getElementId(element);
      const editor = Drupal.CKEditor5Instances.get(editorID);

      if (editor) {
        editor.sourceElement.nextElementSibling.setAttribute('id', `cke_${hash}`);
        window.location.replace(`#cke_${hash}`);
      }
    }
  }

  $(window).on('hashchange.ckeditor', redirectTextareaFragmentToCKEditor5Instance);
  $(window).on('dialog:beforecreate', () => {
    $('.ckeditor5-dialog-loading').animate({
      top: '-40px'
    }, function removeDialogLoading() {
      $(this).remove();
    });
  });
  $(window).on('editor:dialogsave', (e, values) => {
    if (Drupal.ckeditor5.saveCallback) {
      Drupal.ckeditor5.saveCallback(values);
    }
  });
  $(window).on('dialog:afterclose', () => {
    if (Drupal.ckeditor5.saveCallback) {
      Drupal.ckeditor5.saveCallback = null;
    }
  });
})(Drupal, Drupal.debounce, CKEditor5, jQuery);