/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.SplitWidget} splitWidget
 */
WebInspector.Drawer = function(splitWidget)
{
    WebInspector.VBox.call(this);
    this.element.id = "drawer-contents";

    this._splitWidget = splitWidget;
    splitWidget.hideDefaultResizer();
    splitWidget.setSidebarWidget(this);
    this.setMinimumSize(0, 27);

    this._tabbedPane = new WebInspector.TabbedPane();
    this._tabbedPane.element.id = "drawer-tabbed-pane";
    this._tabbedPane.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected, this._tabSelected, this);

    var toolbar = new WebInspector.Toolbar("drawer-close-toolbar");
    var closeButton = new WebInspector.ToolbarButton(WebInspector.UIString("Close drawer"), "delete-toolbar-item");
    closeButton.addEventListener("click", this.closeDrawer.bind(this));
    toolbar.appendToolbarItem(closeButton);
    this._tabbedPane.appendAfterTabStrip(toolbar.element);

    this._extensibleTabbedPaneController = new WebInspector.ExtensibleTabbedPaneController(this._tabbedPane, "drawer-view");
    this._extensibleTabbedPaneController.enableMoreTabsButton();

    splitWidget.installResizer(this._tabbedPane.headerElement());
    this._lastSelectedViewSetting = WebInspector.settings.createSetting("WebInspector.Drawer.lastSelectedView", "console");
    this._tabbedPane.show(this.element);
}

WebInspector.Drawer.prototype = {
    /**
     * @param {string} id
     * @param {boolean=} immediate
     * @return {!Promise.<?WebInspector.Widget>}
     */
    showView: function(id, immediate)
    {
        /**
         * @param {?WebInspector.Widget} view
         * @return {?WebInspector.Widget} view
         * @this {WebInspector.Drawer}
         */
        function tabViewLoaded(view)
        {
            this.focus();
            return view;
        }

        this._innerShow(immediate);
        WebInspector.userMetrics.drawerShown(id);
        return this._extensibleTabbedPaneController.showTab(id).then(tabViewLoaded.bind(this));
    },

    showDrawer: function()
    {
        this._innerShow();
    },

    wasShown: function()
    {
        var id = this._lastSelectedViewSetting.get();
        if (!this._firstTabSelected && this._tabbedPane.hasTab(id))
            this.showView(id);
    },

    willHide: function()
    {
    },

    /**
     * @param {boolean=} immediate
     */
    _innerShow: function(immediate)
    {
        if (this.isShowing())
            return;

        this._splitWidget.showBoth(!immediate);

        if (this._visibleView())
            this._visibleView().focus();
    },

    closeDrawer: function()
    {
        if (!this.isShowing())
            return;

        WebInspector.restoreFocusFromElement(this.element);
        this._splitWidget.hideSidebar(true);
    },

    /**
     * @return {?WebInspector.Widget} view
     */
    _visibleView: function()
    {
        return this._tabbedPane.visibleView;
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _tabSelected: function(event)
    {
        this._firstTabSelected = true;
        var tabId = this._tabbedPane.selectedTabId;
        if (tabId && event.data["isUserGesture"])
            this._lastSelectedViewSetting.set(tabId);
    },

    /**
     * @override
     * @return {!Element}
     */
    defaultFocusedElement: function()
    {
        return this._tabbedPane.defaultFocusedElement();
    },

    /**
     * @return {?string}
     */
    selectedViewId: function()
    {
        return this._tabbedPane.selectedTabId;
    },

    initialPanelShown: function()
    {
        this._initialPanelWasShown = true;
    },

    __proto__: WebInspector.VBox.prototype
}
