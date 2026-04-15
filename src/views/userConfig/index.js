<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none';
                   style-src 'nonce-{{NONCE}}';
                   script-src 'nonce-{{NONCE}}';" />
    <title>{{TITLE}}</title>
    <style nonce="{{NONCE}}">
{{STYLE}}
    </style>
</head>
<body>

    <h1>{{TITLE}}</h1>
    <p class="subtitle">This is how other collaborators will see you.</p>

    <div class="validation-summary" id="validationSummary">
        Please fix the following before saving:
        <ul id="validationList"></ul>
    </div>

    <div class="section">
        <div class="section-title">Identity</div>
        <div class="grid">
            <div class="field field-full">
                <label>Display name <span class="req">*</span></label>
                <input type="text" id="displayName" placeholder="e.g. Alex" autocomplete="off" spellcheck="false" maxlength="32" />
                <span class="field-error" id="err-displayName">Display name is required.</span>
            </div>
        </div>
    </div>

    <hr />

    <div class="section">
        <div class="section-title">Cursor color</div>
        <p class="hint">Used to highlight your cursor and selections for other collaborators.</p>
        <div class="color-grid" id="colorSwatches"></div>
        <div class="custom-color-row">
            <label for="customColor">Custom</label>
            <input type="color" id="customColor" value="#4fc3f7" />
        </div>
        <input type="hidden" id="selectedColor" value="#4fc3f7" />
    </div>

    <hr />

    <div class="actions">
        <button id="btnCancel" class="btn-ghost">Cancel</button>
        <button id="btnNext" class="btn-primary">Next: Connection ›</button>
    </div>

<script nonce="{{NONCE}}">
{{SCRIPT}}
</script>
</body>
</html>
