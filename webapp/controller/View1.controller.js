sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/SegmentedButtonItem",
    "sap/m/Menu",
    "sap/m/MenuItem",
    "sap/ui/core/ResizeHandler",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/ui/core/format/DateFormat"
], function (
    Controller,
    SegmentedButtonItem,
    Menu,
    MenuItem,
    ResizeHandler,
    JSONModel,
    Filter,
    FilterOperator,
    MessageToast,
    DateFormat
) {
    "use strict";

    var TABS = [
        { key: "overview", text: "Overview" },
        { key: "monitoring", text: "Control Monitoring" },
        { key: "risk", text: "Risk Assessment" },
        { key: "security", text: "SAP Security & SoD" },
        { key: "audit", text: "Audit Management" },
        { key: "compliance", text: "Compliance" },
        { key: "licenses", text: "SAP Licenses" },
        { key: "remediation", text: "Remediation" },
        { key: "inbox", text: "My Inbox" },
        { key: "reports", text: "Reports" }
    ];

    var TAB_PADDING = 48;
    var MORE_WIDTH = 90;

    var SOD_FILTERS = [
        { id: "sodSelCompany", path: "CompanyCode" },
        { id: "sodSelUserType", path: "UserType" }
    ];

    var ROLE_FILTERS = [
        { id: "sodSelUserStatus", path: "UserStatus" },
        { id: "sodSelUserType", path: "Ustyp" },
        { id: "sodSelCompany", path: "CompanyCode" }
    ];

    var NON_COUNT_FIELDS = [
        "__metadata", "System", "UserStatus", "Ustyp",
        "UserType", "Usertype", "CompanyCode", "Comapnycode",
        "InclAssign", "DateFrom", "DateTo"
    ];

    var ROLE_COUNT_FIELDS = [
        "RoleCount", "RolesCount", "TotalRoles",
        "AssignedRoleCount", "Count", "Roles"
    ];

    var HIGHRISK_FILTERS = [
        { id: "sodSelSystem", path: "System" },
        { id: "sodSelCompany", path: "CompanyCode" },
        { id: "sodSelUserType", path: "UserType" },
        { id: "sodSelUserStatus", path: "UserStatus" }
    ];

    var HIGHRISK_COUNT_FIELDS = [
        "HighRiskCount", "HighRiskAccess", "HighRiskUsers",
        "HighRisk", "TotalCount", "Count"
    ];

    var HIGHRISK_USERS_TOP = 5;

    var HRU_FIELDS = {
        userId: ["UserId", "UserID", "Bname", "User", "Uname"],
        name: ["UserName", "FullName", "Name", "NameText", "UserFullName"],
        access: ["CriticalAccess", "Access", "CriticalAuth", "Authorization", "Roles", "RoleName"],
        system: ["SystemName", "System", "Sysid"],
        risk: ["Risk", "RiskLevel", "RiskClass", "Severity", "RiskCategory"]
    };

    var NEWUSERS_COUNT_FIELDS = [
        "Usercount", "NewUsersCount", "NewUserCount",
        "NewUsers", "TotalCount", "Count"
    ];

    var ROLECHANGES_FILTERS = [
        { id: "sodSelCompany", path: "CompanyCode" }
    ];

    var ROLECHANGES_COUNT_FIELDS = [
        "RoleChangesCount", "RoleChangeCount",
        "RoleChanges", "ChangesCount", "TotalCount", "Count"
    ];

    var TERMINATED_FIELDS = [
        "DeletedUsers", "TerminatedUsers",
        "TerminatedNotDisabled", "TerminatedNotDisabledUsers",
        "TermUsers", "TerminatedCount"
    ];

    // Exceptions use the same sodModel service.
    var EXC_TOP = 5;

    // FIX: field names now match the real backend entity
    // (ZAPI_NAX_AUDIT_SRV / ExeceptionidsSet):
    // System, ExecutionId, ExecutionType, Description, RuleId,
    // OwnerTeam, DueDate, ClosedOn, Status ("O"), StatusText ("Open"), OwnerText
    var EXC_FIELDS = {
        id: ["ExecutionId", "ExceptionId", "ExeceptionId", "ExceptionID", "ExeceptionID", "Exceptionid", "Execeptionid", "Id"],
        type: ["ExecutionType", "ExceptionType", "Type", "ExecType", "Category"],
        description: ["Description", "Descr", "ExceptionDesc", "Desc", "Text"],
        owner: ["OwnerText", "OwnerTeam", "Owner", "OwnerName", "Responsible"],
        due: ["DueDate", "Duedate", "Due", "DueOn"],
        // StatusText ("Open") must come BEFORE Status ("O")
        status: ["StatusText", "ExceptionStatus", "Stat", "Status"]
    };

    // Used only if the backend returns a one-letter status code
    var STATUS_CODES = {
        "O": "Open",
        "R": "In Review",
        "C": "Closed",
        "X": "Closed"
    };

    function row(no, domain, app, pass, fail, nt, un, comp, target, status) {
        return {
            no: no,
            domain: domain,
            applicable: app,
            passed: pass,
            failed: fail,
            notTested: nt,
            unavailable: un,
            compliance: comp,
            target: target,
            status: status
        };
    }

    // FIX: skips empty strings too, so an empty "System" field
    // no longer hides a later field that has a value.
    function pick(o, aNames) {
        for (var i = 0; i < aNames.length; i++) {
            var v = o[aNames[i]];
            if (v !== undefined && v !== null && v !== "") {
                return v;
            }
        }
        return "";
    }

    function pickCount(o, aNames) {
        for (var i = 0; i < aNames.length; i++) {
            if (o[aNames[i]] !== undefined) {
                return parseInt(o[aNames[i]], 10) || 0;
            }
        }

        var sKey = Object.keys(o).filter(function (k) {
            return NON_COUNT_FIELDS.indexOf(k) < 0 &&
                /^\d+$/.test(String(o[k]).trim());
        })[0];

        return sKey ? (parseInt(o[sKey], 10) || 0) : 0;
    }

    function dateFilters(oFrom, oTo) {
        var oFmt = DateFormat.getDateInstance({
            pattern: "dd.MM.yyyy"
        });

        return [
            new Filter("DateFrom", FilterOperator.EQ, oFmt.format(oFrom)),
            new Filter("DateTo", FilterOperator.EQ, oFmt.format(oTo))
        ];
    }

    function riskInfo(sRisk) {
        var s = String(sRisk || "").toLowerCase();

        if (s.indexOf("crit") === 0) {
            return { w: 0, state: "Error" };
        }
        if (s.indexOf("high") === 0) {
            return { w: 1, state: "Warning" };
        }
        if (s.indexOf("med") === 0) {
            return { w: 2, state: "Warning" };
        }
        if (s.indexOf("low") === 0) {
            return { w: 3, state: "Success" };
        }

        return { w: 4, state: "None" };
    }

    function fmtDate(v) {
        if (v instanceof Date) {
            return DateFormat.getDateInstance({
                pattern: "dd MMM yyyy",
                UTC: true
            }).format(v);
        }
        return v || "";
    }

    function fmtStatus(sStatus) {
        var s = String(sStatus || "").trim();
        return STATUS_CODES[s.toUpperCase()] || s;
    }

    function statusInfo(sStatus) {
        var s = String(sStatus || "").toLowerCase();

        if (s.indexOf("open") === 0) {
            return "Information";
        }
        if (s.indexOf("review") >= 0) {
            return "Warning";
        }
        if (s.indexOf("remed") === 0) {
            return "Success";
        }
        if (s.indexOf("closed") === 0) {
            return "Success";
        }
        if (s.indexOf("overdue") === 0) {
            return "Error";
        }

        return "None";
    }

    function getDefaultSodRange() {
        var oEnd = new Date();
        var oStart = new Date(
            oEnd.getFullYear(),
            oEnd.getMonth() - 1,
            oEnd.getDate()
        );

        if (oStart.getMonth() !== ((oEnd.getMonth() + 11) % 12)) {
            oStart = new Date(oEnd.getFullYear(), oEnd.getMonth(), 0);
        }

        return {
            from: oStart,
            to: oEnd
        };
    }

    return Controller.extend("project1.controller.View1", {

        onInit: function () {

            // Control Monitoring date range
            var oRange = this.byId("dateRange");
            oRange.setDateValue(new Date(2026, 5, 1));
            oRange.setSecondDateValue(new Date(2026, 10, 30));

            // SAP Security & SoD date range
            var oDef = getDefaultSodRange();
            var oSodRange = this.byId("sodDateRange");

            oSodRange.setDateValue(oDef.from);
            oSodRange.setSecondDateValue(oDef.to);

            this.byId("monitoringContent").setVisible(false);
            this.byId("riskAssessmentContent").setVisible(false);
            this.byId("sodContent").setVisible(false);
            this.byId("auditContent").setVisible(false);

            // Audit Management date range (01.10.2026 - 31.12.2026)
            var oAuditRange = this.byId("auditDateRange");
            oAuditRange.setDateValue(new Date(2026, 9, 1));
            oAuditRange.setSecondDateValue(new Date(2026, 11, 31));

            // CONTROL DOMAIN SCORECARD
            this.getView().setModel(new JSONModel({
                items: [
                    row("1", "SAP Security & Access", 48, 40, 8, 0, 0, "83%", "≥ 95%", "Below Target"),
                    row("2", "Change Management", 36, 30, 6, 0, 0, "83%", "≥ 90%", "Below Target"),
                    row("3", "IT General Controls (ITGC)", 40, 34, 6, 0, 0, "85%", "≥ 90%", "Below Target"),
                    row("4", "Application Controls", 52, 46, 6, 0, 0, "88%", "≥ 90%", "Below Target"),
                    row("5", "Data & Interface Controls", 28, 26, 2, 0, 0, "93%", "≥ 90%", "On Track"),
                    row("6", "Access Certification", 24, 20, 1, 2, 1, "83%", "≥ 90%", "Below Target"),
                    row("7", "Operations & Monitoring", 20, 17, 1, 1, 1, "85%", "≥ 90%", "Below Target"),
                    row("8", "Configuration & Master Data", 18, 15, 0, 2, 1, "83%", "≥ 90%", "Below Target"),
                    row("9", "Financial Process Controls", 22, 18, 0, 3, 1, "82%", "≥ 90%", "Below Target"),
                    row("10", "Procurement & Vendor Controls", 16, 12, 0, 5, 1, "75%", "≥ 90%", "Below Target"),
                    row("11", "Compliance & Regulatory", 12, 11, 0, 1, 0, "92%", "≥ 90%", "On Track"),
                    row("", "Total", 316, 259, 30, 18, 9, "82%", "≥ 90%", "")
                ]
            }), "scorecardModel");

            // MODULE COMPLIANCE
            this.getView().setModel(new JSONModel({
                items: [
                    { module: "FI/CO", compliance: "84%", target: "≥ 95%", status: "Below Target" },
                    { module: "MM", compliance: "78%", target: "≥ 90%", status: "Below Target" },
                    { module: "SD", compliance: "86%", target: "≥ 90%", status: "Below Target" },
                    { module: "PP", compliance: "81%", target: "≥ 90%", status: "Below Target" },
                    { module: "HCM", compliance: "76%", target: "≥ 90%", status: "Below Target" },
                    { module: "Basis/Security", compliance: "88%", target: "≥ 95%", status: "Below Target" }
                ]
            }), "moduleModel");

            // MONITORING & DATA HEALTH
            this.getView().setModel(new JSONModel({
                items: [
                    { component: "Security Audit Logs", status: "Warning", state: "Warning", affectedControls: "6 Controls", lastRun: "15 Nov, 08:10", recommendation: "Stabilize log ingestion →" },
                    { component: "SoD Rule Sync", status: "Healthy", state: "Success", affectedControls: "–", lastRun: "15 Nov, 09:00", recommendation: "No action required" },
                    { component: "Background Control Jobs", status: "Delayed", state: "Warning", affectedControls: "8 Controls", lastRun: "15 Nov, 06:30", recommendation: "Restart & fix schedule →" },
                    { component: "Identity Connector", status: "Optional", state: "None", affectedControls: "–", lastRun: "–", recommendation: "Not configured (VI scope)" },
                    { component: "Evidence Collector", status: "Healthy", state: "Success", affectedControls: "–", lastRun: "15 Nov, 09:20", recommendation: "Running normally" }
                ]
            }), "healthModel");

            // CONTROL EFFECTIVENESS TREND
            this.getView().setModel(new JSONModel({
                items: [
                    { month: "Jun", actual: 75, target: 90 },
                    { month: "Jul", actual: 76, target: 90 },
                    { month: "Aug", actual: 77, target: 90 },
                    { month: "Sep", actual: 77, target: 90 },
                    { month: "Oct", actual: 78, target: 90 },
                    { month: "Nov", actual: 78, target: 90 }
                ]
            }), "trendModel");

            // ASSURANCE CONFIDENCE OVERVIEW
            this.getView().setModel(new JSONModel({
                items: [
                    { status: "Validated", count: 259 },
                    { status: "Pending Review", count: 18 },
                    { status: "Stale (Overdue)", count: 12 },
                    { status: "Unavailable", count: 9 },
                    { status: "Not Applicable", count: 18 }
                ]
            }), "assuranceModel");

            // TOP CONTROL EXCEPTIONS
            this.getView().setModel(new JSONModel({
                items: [
                    { no: "1", id: "CR-001", control: "Revoke SAP_ALL from non-emergency users", module: "Security", owner: "SAP Security", due: "27 Oct 2026", priority: "Critical", state: "Error" },
                    { no: "2", id: "CR-003", control: "Disable terminated user and clean up dormant users", module: "Security", owner: "HR / SAP Sec", due: "27 Oct 2026", priority: "Critical", state: "Error" },
                    { no: "3", id: "FND-001", control: "Close unapproved production changes and attach evidence", module: "Change", owner: "Change Mgmt", due: "28 Oct 2026", priority: "High", state: "Warning" }
                ]
            }), "excModel");

            // AI RECOMMENDATIONS
            this.getView().setModel(new JSONModel({
                items: [
                    { no: "1", text: "Fix module compliance gaps (FI/CO, SD, PP, Basis)", owner: "IT / Module Leads", due: "30 Nov 2026", impact: "High", state: "Error" },
                    { no: "2", text: "Close 30 failed controls (8 Security, 6 Change, 6 ITGC, 10 Others)", owner: "GRC Team", due: "15 Dec 2026", impact: "High", state: "Error" },
                    { no: "3", text: "Resolve monitoring gaps – Security Logs & 8 jobs", owner: "IT Operations", due: "22 Nov 2026", impact: "Medium", state: "Warning" },
                    { no: "4", text: "Configure Identity Connector (or mark Not Applicable – VI)", owner: "IT / GRC", due: "15 Dec 2026", impact: "Medium", state: "Warning" },
                    { no: "5", text: "Improve control effectiveness from 78% to ≥ 90% (+12 pp)", owner: "QRC & IT", due: "Q1 2027", impact: "Medium", state: "Warning" }
                ]
            }), "aiModel");

            // SOD TILES MODEL
            this.getView().setModel(new JSONModel({
                totalUsers: 0,
                activeUsers: 0,
                activePct: "",
                dormantUsers: 0,
                dormantPct: "",
                terminatedUsers: 0,
                terminatedPct: "",
                roles: 0,
                sodConflicts: 0,
                highRiskAccess: 0,
                accessReviewsDue: 0
            }), "sodTilesModel");

            // HIGH RISK USERS MODEL
            this.getView().setModel(new JSONModel({
                items: []
            }), "sodHighRiskModel");

            // USER PROVISIONING MODEL
            this.getView().setModel(new JSONModel({
                newUsers: 0,
                roleChanges: 0,
                recertDue: 0,
                recertCompleted: 0
            }), "sodProvModel");

            // EXCEPTIONS MODEL
            this.getView().setModel(new JSONModel({
                items: [],
                total: 0
            }), "sodExcModel");

            this._setupCharts();
            this._setupRiskModels();
            this._setupRiskCharts();

            // TAB SETTINGS
            this._sSelected = "overview";
            this._iCount = TABS.length;
            this._sSignature = "";

            this.getView().addEventDelegate({
                onAfterRendering: this._onViewRendered.bind(this)
            });
        },

        onExit: function () {
            if (this._sResizeId) {
                ResizeHandler.deregister(this._sResizeId);
                this._sResizeId = null;
            }

            if (this._oMenu) {
                this._oMenu.destroy();
                this._oMenu = null;
            }
        },

        onFilterSearch: function () {
            // Future filter logic
        },

        onAuditSearch: function () {
            // Future Audit Management logic
        },

        // ============================================================
        // SAP SECURITY & SOD
        // ============================================================

        onSodSearch: function () {
            this._loadSodData();
        },

        _sodVal: function (sId) {
            var oControl = this.byId(sId);

            if (!oControl) {
                return "*";
            }

            var sKey = oControl.getSelectedKey();
            return sKey || "*";
        },

        _getUserDateFilters: function () {
            var oRange = this.byId("sodDateRange");
            var oFrom = oRange.getDateValue();
            var oTo = oRange.getSecondDateValue();

            if (!oFrom || !oTo) {
                return [];
            }

            return dateFilters(oFrom, oTo);
        },

        _getSodDateFilters: function () {
            var oRange = this.byId("sodDateRange");
            var oFrom = oRange.getDateValue();
            var oTo = oRange.getSecondDateValue();

            if (!oFrom || !oTo) {
                var oDef = getDefaultSodRange();

                oFrom = oDef.from;
                oTo = oDef.to;

                oRange.setDateValue(oFrom);
                oRange.setSecondDateValue(oTo);
            }

            return dateFilters(oFrom, oTo);
        },

        _loadSodData: function () {
            var oModel = this.getOwnerComponent().getModel("sodModel") ||
                this.getView().getModel("sodModel");

            var oBox = this.byId("sodKpiTiles");

            if (!oModel) {
                MessageToast.show("sodModel not found in manifest.json");
                console.error("sodModel is not available");
                return;
            }

            var aOptDate = this._getUserDateFilters();
            var aDateFilters = this._getSodDateFilters();

            // Seven OData calls
            this._iSodBusy = 7;

            if (oBox) {
                oBox.setBusy(true);
            }

            this._readSod(oModel, oBox, aDateFilters);
            this._readRoles(oModel, oBox, aDateFilters);
            this._readHighRisk(oModel, oBox);
            this._readHighRiskUsers(oModel, oBox);
            this._readNewUsers(oModel, oBox, aOptDate);
            this._readRoleChanges(oModel, oBox, aOptDate);

            // Important: pass the same OData model
            this._readExceptions(oBox, oModel);
        },

        _sodDone: function (oBox) {
            this._iSodBusy = Math.max((this._iSodBusy || 1) - 1, 0);

            if (this._iSodBusy === 0 && oBox) {
                oBox.setBusy(false);
            }
        },

        // TOTAL / ACTIVE / DORMANT / TERMINATED USERS
        _readSod: function (oModel, oBox, aDateFilters) {
            var aFilters = SOD_FILTERS.map(function (f) {
                return new Filter(
                    f.path,
                    FilterOperator.EQ,
                    this._sodVal(f.id)
                );
            }.bind(this)).concat(aDateFilters);

            oModel.read("/UserDataSet", {
                filters: aFilters,

                success: function (oData) {
                    this._sodDone(oBox);

                    var aRes = (oData && oData.results) || [];
                    var o = aRes.length ? aRes[0] : {};

                    console.log("UserDataSet response:", aRes);

                    var iTotal = parseInt(o.TotalUsers, 10) || 0;
                    var iAct = parseInt(o.ActiveUsers, 10) || 0;
                    var iDor = parseInt(o.DormantUsers, 10) || 0;

                    var iTer = 0;

                    var sTerKey = TERMINATED_FIELDS.filter(function (k) {
                        return o[k] !== undefined;
                    })[0];

                    if (!sTerKey) {
                        sTerKey = Object.keys(o).filter(function (k) {
                            return /termin/i.test(k);
                        })[0];
                    }

                    if (sTerKey) {
                        iTer = parseInt(o[sTerKey], 10) || 0;
                    }

                    var fnPct = function (n, vBackend) {
                        var f = parseFloat(vBackend);

                        if (!isNaN(f)) {
                            return Math.round(f) + "%";
                        }

                        return iTotal > 0 ?
                            Math.round(n * 100 / iTotal) + "%" : "";
                    };

                    this.getView().getModel("sodTilesModel").setData({
                        totalUsers: iTotal,
                        activeUsers: iAct,
                        activePct: fnPct(iAct, o.ActiveUsersPercentage),
                        dormantUsers: iDor,
                        dormantPct: fnPct(iDor, o.DormantUsersPercentage),
                        terminatedUsers: iTer,
                        terminatedPct: fnPct(iTer, o.DeletedUsersPercentage),
                        sodConflicts: 0,
                        accessReviewsDue: 0
                    }, true);

                }.bind(this),

                error: function (oErr) {
                    this._sodDone(oBox);

                    console.error("SoD read failed:", oErr);

                    MessageToast.show(
                        "Failed to load SoD data (HTTP " +
                        ((oErr && oErr.statusCode) || "?") + ")"
                    );
                }.bind(this)
            });
        },

        // ROLES
        _readRoles: function (oModel, oBox, aDateFilters) {
            var aFilters = ROLE_FILTERS.map(function (f) {
                return new Filter(
                    f.path,
                    FilterOperator.EQ,
                    this._sodVal(f.id)
                );
            }.bind(this)).concat(aDateFilters);

            oModel.read("/ASSIGNEDROLECOUNTSet", {
                filters: aFilters,

                success: function (oData) {
                    this._sodDone(oBox);

                    var aRes = (oData && oData.results) || [];
                    var o = aRes.length ? aRes[0] : {};

                    console.log("Roles response:", aRes);

                    var iRoles = 0;
                    var bFound = false;

                    for (var i = 0; i < ROLE_COUNT_FIELDS.length; i++) {
                        if (o[ROLE_COUNT_FIELDS[i]] !== undefined) {
                            iRoles = parseInt(o[ROLE_COUNT_FIELDS[i]], 10) || 0;
                            bFound = true;
                            break;
                        }
                    }

                    if (!bFound) {
                        Object.keys(o).some(function (sKey) {
                            if (NON_COUNT_FIELDS.indexOf(sKey) >= 0) {
                                return false;
                            }

                            if (/^\d+$/.test(String(o[sKey]).trim())) {
                                iRoles = parseInt(o[sKey], 10) || 0;
                                console.log("Roles count field:", sKey);
                                return true;
                            }

                            return false;
                        });
                    }

                    this.getView().getModel("sodTilesModel")
                        .setProperty("/roles", iRoles);

                }.bind(this),

                error: function (oErr) {
                    this._sodDone(oBox);

                    console.error("Roles read failed:", oErr);

                    MessageToast.show(
                        "Failed to load Roles (HTTP " +
                        ((oErr && oErr.statusCode) || "?") + ")"
                    );
                }.bind(this)
            });
        },

        // HIGH RISK ACCESS COUNT
        _readHighRisk: function (oModel, oBox) {
            var aFilters = HIGHRISK_FILTERS.map(function (f) {
                return new Filter(
                    f.path,
                    FilterOperator.EQ,
                    this._sodVal(f.id)
                );
            }.bind(this));

            oModel.read("/HighRiskAccessCountSet", {
                filters: aFilters,

                success: function (oData) {
                    this._sodDone(oBox);

                    var aRes = (oData && oData.results) || [];
                    var o = aRes.length ? aRes[0] : {};

                    console.log("HighRisk response:", aRes);

                    var iHigh = 0;

                    for (var i = 0; i < HIGHRISK_COUNT_FIELDS.length; i++) {
                        if (o[HIGHRISK_COUNT_FIELDS[i]] !== undefined) {
                            iHigh = parseInt(o[HIGHRISK_COUNT_FIELDS[i]], 10) || 0;
                            break;
                        }
                    }

                    this.getView().getModel("sodTilesModel")
                        .setProperty("/highRiskAccess", iHigh);

                }.bind(this),

                error: function (oErr) {
                    this._sodDone(oBox);

                    console.error("HighRisk read failed:", oErr);

                    MessageToast.show(
                        "Failed to load High Risk Access (HTTP " +
                        ((oErr && oErr.statusCode) || "?") + ")"
                    );
                }.bind(this)
            });
        },

        // HIGH-RISK USERS TABLE
        _readHighRiskUsers: function (oModel, oBox) {
            var aFilters = HIGHRISK_FILTERS.map(function (f) {
                return new Filter(
                    f.path,
                    FilterOperator.EQ,
                    this._sodVal(f.id)
                );
            }.bind(this));

            oModel.read("/HighRiskUsersSet", {
                filters: aFilters,

                success: function (oData) {
                    this._sodDone(oBox);

                    var aRes = (oData && oData.results) || [];

                    console.log("HighRiskUsers response:", aRes);

                    var aRows = aRes.map(function (o) {
                        var sRisk = String(pick(o, HRU_FIELDS.risk));
                        var oRisk = riskInfo(sRisk);

                        return {
                            userId: pick(o, HRU_FIELDS.userId),
                            name: pick(o, HRU_FIELDS.name),
                            access: pick(o, HRU_FIELDS.access),
                            system: pick(o, HRU_FIELDS.system),
                            risk: sRisk,
                            state: oRisk.state,
                            _w: oRisk.w
                        };
                    });

                    aRows = aRows
                        .map(function (r, i) {
                            r._i = i;
                            return r;
                        })
                        .sort(function (a, b) {
                            return (a._w - b._w) || (a._i - b._i);
                        })
                        .slice(0, HIGHRISK_USERS_TOP)
                        .map(function (r, i) {
                            return {
                                no: String(i + 1),
                                userId: r.userId,
                                name: r.name,
                                access: r.access,
                                system: r.system,
                                risk: r.risk,
                                state: r.state
                            };
                        });

                    this.getView().getModel("sodHighRiskModel")
                        .setData({ items: aRows });

                }.bind(this),

                error: function (oErr) {
                    this._sodDone(oBox);

                    console.error("HighRiskUsers read failed:", oErr);

                    MessageToast.show(
                        "Failed to load High-Risk Users (HTTP " +
                        ((oErr && oErr.statusCode) || "?") + ")"
                    );
                }.bind(this)
            });
        },

        // NEW USERS
        _readNewUsers: function (oModel, oBox, aOptDate) {

            // UserStatus is fixed as Active
            var aFilters = [
                new Filter("UserStatus", FilterOperator.EQ, "Active"),
                new Filter(
                    "Usertype",
                    FilterOperator.EQ,
                    this._sodVal("sodSelUserType")
                ),
                new Filter(
                    "Comapnycode",
                    FilterOperator.EQ,
                    this._sodVal("sodSelCompany")
                )
            ].concat(aOptDate);

            oModel.read("/NewUsersCountSet", {
                filters: aFilters,

                success: function (oData) {
                    this._sodDone(oBox);

                    var aRes = (oData && oData.results) || [];
                    var o = aRes.length ? aRes[0] : {};

                    console.log("NewUsers response:", aRes);

                    this.getView().getModel("sodProvModel")
                        .setProperty(
                            "/newUsers",
                            pickCount(o, NEWUSERS_COUNT_FIELDS)
                        );

                }.bind(this),

                error: function (oErr) {
                    this._sodDone(oBox);

                    console.error("NewUsers read failed:", oErr);

                    MessageToast.show(
                        "Failed to load New Users (HTTP " +
                        ((oErr && oErr.statusCode) || "?") + ")"
                    );
                }.bind(this)
            });
        },

        // ROLE CHANGES
        _readRoleChanges: function (oModel, oBox, aOptDate) {
            var aFilters = ROLECHANGES_FILTERS.map(function (f) {
                return new Filter(
                    f.path,
                    FilterOperator.EQ,
                    this._sodVal(f.id)
                );
            }.bind(this));

            aFilters.push(
                new Filter("InclAssign", FilterOperator.EQ, "X")
            );

            aFilters = aFilters.concat(aOptDate);

            oModel.read("/RoleChangesCountSet", {
                filters: aFilters,

                success: function (oData) {
                    this._sodDone(oBox);

                    var aRes = (oData && oData.results) || [];
                    var o = aRes.length ? aRes[0] : {};

                    console.log("RoleChanges response:", aRes);

                    this.getView().getModel("sodProvModel")
                        .setProperty(
                            "/roleChanges",
                            pickCount(o, ROLECHANGES_COUNT_FIELDS)
                        );

                }.bind(this),

                error: function (oErr) {
                    this._sodDone(oBox);

                    console.error("RoleChanges read failed:", oErr);

                    MessageToast.show(
                        "Failed to load Role Changes (HTTP " +
                        ((oErr && oErr.statusCode) || "?") + ")"
                    );
                }.bind(this)
            });
        },

        // ACCESS & SOD EXCEPTIONS
        _readExceptions: function (oBox, oModel) {

            console.log("Exception OData Model:", oModel);

            if (!oModel) {
                this._sodDone(oBox);
                MessageToast.show("OData Model not found");
                return;
            }

            oModel.read("/ExeceptionidsSet", {

                success: function (oData) {
                    this._sodDone(oBox);

                    var aRes = (oData && oData.results) || [];

                    console.log("Exceptions Backend Response:", aRes);

                    var aRows = aRes.slice(0, EXC_TOP).map(function (o, i) {
                        var sStatus = fmtStatus(
                            pick(o, EXC_FIELDS.status)
                        );

                        return {
                            no: String(i + 1),
                            id: pick(o, EXC_FIELDS.id),
                            type: pick(o, EXC_FIELDS.type),
                            description: pick(o, EXC_FIELDS.description),
                            owner: pick(o, EXC_FIELDS.owner),
                            due: fmtDate(pick(o, EXC_FIELDS.due)),
                            status: sStatus,
                            state: statusInfo(sStatus)
                        };
                    });

                    this.getView().getModel("sodExcModel").setData({
                        items: aRows,
                        total: aRes.length
                    });

                    console.log("Exception Table Data:", aRows);

                }.bind(this),

                error: function (oError) {
                    this._sodDone(oBox);

                    console.error("Exception OData Error:", oError);

                    MessageToast.show(
                        "Failed to load Exceptions (HTTP " +
                        ((oError && oError.statusCode) || "?") + ")"
                    );
                }.bind(this)

            });
        },

        // ============================================================
        // RISK ASSESSMENT
        // ============================================================

        _setupRiskModels: function () {

            this.getView().setModel(new JSONModel({
                items: [
                    { module: "FI/CO", count: 14 },
                    { module: "MM", count: 10 },
                    { module: "SD", count: 8 },
                    { module: "PP", count: 6 },
                    { module: "HCM", count: 5 },
                    { module: "Basis/Security", count: 11 }
                ]
            }), "riskModuleModel");

            this.getView().setModel(new JSONModel({
                items: [
                    { month: "Jun", open: 62, outside: 9 },
                    { month: "Jul", open: 60, outside: 9 },
                    { month: "Aug", open: 58, outside: 8 },
                    { month: "Sep", open: 57, outside: 8 },
                    { month: "Oct", open: 55, outside: 7 },
                    { month: "Nov", open: 54, outside: 6 }
                ]
            }), "riskTrendModel");

            this.getView().setModel(new JSONModel({
                items: [
                    { domain: "SAP Security & Access", count: 14 },
                    { domain: "Change Management", count: 10 },
                    { domain: "IT General Controls (ITGC)", count: 8 },
                    { domain: "Data & Interface Controls", count: 7 },
                    { domain: "Application Controls", count: 6 }
                ]
            }), "riskDomainModel");

            this.getView().setModel(new JSONModel({
                items: [
                    { status: "Open", count: 28 },
                    { status: "In Treatment", count: 12 },
                    { status: "Accepted", count: 4 },
                    { status: "Pending Approval", count: 5 },
                    { status: "Closed (This Period)", count: 5 }
                ]
            }), "riskTreatModel");

            this.getView().setModel(new JSONModel({
                items: [
                    { no: "1", risk: "CR-001 – Privileged SAP access", domain: "Security", residual: "Critical", state: "Error", owner: "SAP Security", due: "27 Oct 2026" },
                    { no: "2", risk: "CR-003 – Active leaver account", domain: "Security", residual: "Critical", state: "Error", owner: "HR / SAP Sec", due: "27 Oct 2026" },
                    { no: "3", risk: "FND-001 – Unapproved prod. changes", domain: "Change", residual: "High", state: "Warning", owner: "Change Mgmt", due: "28 Oct 2026" },
                    { no: "4", risk: "CR-007 – Critical SoD conflict", domain: "SoD", residual: "High", state: "Warning", owner: "GRC Team", due: "30 Oct 2026" },
                    { no: "5", risk: "CR-011 – Sensitive table maintenance", domain: "ITGC", residual: "High", state: "Warning", owner: "IT Operations", due: "04 Nov 2026" }
                ]
            }), "riskTopModel");

            this.getView().setModel(new JSONModel({
                items: [
                    { id: "CR-001", title: "Privileged SAP access (SAP_ALL)", module: "Basis", domain: "Security", inherent: 25, residual: 25, level: "Critical", levelState: "Error", treatment: "Investigate and restrict access", status: "Open", statusState: "Information", owner: "SAP Security", due: "27 Oct 2026" },
                    { id: "CR-002", title: "Production change without approval", module: "Basis", domain: "Change", inherent: 20, residual: 15, level: "High", levelState: "Warning", treatment: "Enforce change control & review", status: "In Treatment", statusState: "Warning", owner: "Change Mgmt", due: "28 Oct 2026" },
                    { id: "CR-003", title: "Active terminated user account", module: "HCM", domain: "Security", inherent: 20, residual: 16, level: "Critical", levelState: "Error", treatment: "Disable account and clean up", status: "Overdue", statusState: "Error", owner: "HR / SAP Sec", due: "27 Oct 2026" },
                    { id: "CR-004", title: "Toxic SoD – Vendor create & pay", module: "FI/CO", domain: "SoD", inherent: 16, residual: 12, level: "High", levelState: "Warning", treatment: "Review SoD and mitigate conflict", status: "In Treatment", statusState: "Warning", owner: "GRC Team", due: "30 Oct 2026" },
                    { id: "CR-005", title: "Unencrypted interface data", module: "SD", domain: "ITGC", inherent: 12, residual: 9, level: "Medium", levelState: "Warning", treatment: "Enable encryption and monitor", status: "Open", statusState: "Information", owner: "IT Operations", due: "04 Nov 2026" }
                ]
            }), "riskRegModel");
        },

        _setupRiskCharts: function () {

            this.byId("riskModuleChart").setVizProperties({
                title: { visible: false },
                legend: { visible: true },
                legendGroup: { layout: { position: "right" } },
                plotArea: {
                    colorPalette: ["#0a6ed1", "#4fc3f7", "#2e7d32", "#f9a825", "#ef6c00", "#8e24aa"],
                    dataLabel: { visible: true, type: "value" }
                }
            });

            this.byId("riskTrendChart").setVizProperties({
                title: { visible: false },
                legend: { visible: true },
                legendGroup: { layout: { position: "bottom" } },
                plotArea: {
                    colorPalette: ["#0a6ed1", "#2e7d32"],
                    dataLabel: { visible: true, formatString: "#,##0" }
                },
                valueAxis: {
                    title: { visible: false },
                    scale: { fixedRange: true, minValue: 0, maxValue: 80 }
                },
                categoryAxis: { title: { visible: false } }
            });

            this.byId("riskDomainChart").setVizProperties({
                title: { visible: false },
                legend: { visible: false },
                plotArea: {
                    colorPalette: ["#0a6ed1"],
                    dataLabel: { visible: true }
                },
                valueAxis: { title: { visible: false } },
                categoryAxis: { title: { visible: false } }
            });

            this.byId("riskTreatChart").setVizProperties({
                title: { visible: false },
                legend: { visible: true },
                legendGroup: { layout: { position: "right" } },
                plotArea: {
                    colorPalette: ["#0a6ed1", "#f9a825", "#2e7d32", "#8e24aa", "#9aa5b1"],
                    dataLabel: { visible: true, type: "value" }
                }
            });
        },

        // ============================================================
        // CONTROL MONITORING CHARTS
        // ============================================================

        _setupCharts: function () {

            this.byId("trendChart").setVizProperties({
                title: { visible: false },
                legend: { visible: true },
                legendGroup: { layout: { position: "bottom" } },
                plotArea: {
                    colorPalette: ["#0a6ed1", "#2e7d32"],
                    dataLabel: { visible: true, formatString: "#,##0" }
                },
                valueAxis: {
                    title: { visible: false },
                    scale: { fixedRange: true, minValue: 70, maxValue: 100 }
                },
                categoryAxis: { title: { visible: false } }
            });

            this.byId("assuranceChart").setVizProperties({
                title: { visible: false },
                legend: { visible: true },
                legendGroup: { layout: { position: "right" } },
                plotArea: {
                    colorPalette: ["#2e7d32", "#ef6c00", "#f9a825", "#8e24aa", "#9aa5b1"],
                    dataLabel: { visible: true, type: "value" }
                }
            });
        },

        // ============================================================
        // RESPONSIVE TABS
        // ============================================================

        _onViewRendered: function () {
            if (this._sResizeId) {
                return;
            }

            var oHost = this.byId("_IDGenVBox");

            this._sResizeId = ResizeHandler.register(
                oHost,
                function () {
                    this._sSignature = "";
                    this._layoutTabs();
                }.bind(this)
            );

            this._layoutTabs();
        },

        _getTab: function (sKey) {
            return TABS.filter(function (t) {
                return t.key === sKey;
            })[0];
        },

        _measure: function (sText) {
            if (!this._oCtx) {
                this._oCtx = document.createElement("canvas").getContext("2d");
            }

            this._oCtx.font = "bold 14px '72', Arial, sans-serif";

            return Math.ceil(
                this._oCtx.measureText(sText).width
            ) + TAB_PADDING;
        },

        _getVisibleKeys: function () {
            var aKeys = TABS.map(function (t) {
                return t.key;
            });

            var iCount = this._iCount;
            var iSel = aKeys.indexOf(this._sSelected);

            if (iCount >= aKeys.length || iSel < iCount) {
                return aKeys.slice(0, iCount);
            }

            return aKeys.slice(0, iCount - 1).concat(this._sSelected);
        },

        _layoutTabs: function () {
            var oHost = this.byId("_IDGenVBox").getDomRef();

            if (!oHost) {
                return;
            }

            var iAvail = oHost.clientWidth;

            var aWidths = TABS.map(function (t) {
                return this._measure(t.text);
            }.bind(this));

            var iTotal = aWidths.reduce(function (a, b) {
                return a + b;
            }, 0);

            var iCount = TABS.length;

            if (iTotal > iAvail) {
                iCount = 0;

                var iSum = 0;

                for (var i = 0; i < aWidths.length; i++) {
                    if (iSum + aWidths[i] > iAvail - MORE_WIDTH) {
                        break;
                    }

                    iSum += aWidths[i];
                    iCount++;
                }

                iCount = Math.max(iCount, 2);
            }

            this._iCount = iCount;
            this._iAvail = iAvail;

            this._buildTabs();
        },

        _buildTabs: function () {
            var aVisible = this._getVisibleKeys();
            var bMore = aVisible.length < TABS.length;

            var sSignature =
                aVisible.join("|") +
                "#" + this._sSelected +
                "#" + this._iAvail;

            if (sSignature === this._sSignature) {
                return;
            }

            this._sSignature = sSignature;

            var iAvailForTabs = this._iAvail -
                (bMore ? MORE_WIDTH : 0);

            var aNatural = aVisible.map(function (k) {
                return this._measure(this._getTab(k).text);
            }.bind(this));

            var iNaturalSum = aNatural.reduce(function (a, b) {
                return a + b;
            }, 0);

            var fScale = iNaturalSum > 0 ?
                iAvailForTabs / iNaturalSum : 1;

            var oSeg = this.byId("mainNavigation");

            oSeg.destroyItems();

            aVisible.forEach(function (sKey, i) {
                var oTab = this._getTab(sKey);

                oSeg.addItem(new SegmentedButtonItem({
                    key: oTab.key,
                    text: oTab.text,
                    tooltip: oTab.text,
                    width: Math.floor(aNatural[i] * fScale) + "px"
                }));
            }.bind(this));

            oSeg.setSelectedKey(this._sSelected);

            this.byId("moreButton").setVisible(bMore);
        },

        onTabChange: function (oEvent) {
            this._selectTab(
                oEvent.getParameter("item").getKey()
            );
        },

        _selectTab: function (sKey) {
            this._sSelected = sKey;

            this.byId("monitoringContent")
                .setVisible(sKey === "monitoring");

            this.byId("riskAssessmentContent")
                .setVisible(sKey === "risk");

            this.byId("sodContent")
                .setVisible(sKey === "security");

            this.byId("auditContent")
                .setVisible(sKey === "audit");

            // Backend calls happen only when Go is pressed.
        },

        onMorePress: function (oEvent) {
            var oButton = oEvent.getSource();
            var aVisible = this._getVisibleKeys();

            if (this._oMenu) {
                this._oMenu.destroy();
            }

            this._oMenu = new Menu();

            TABS.filter(function (t) {
                return aVisible.indexOf(t.key) < 0;
            }).forEach(function (oTab) {
                this._oMenu.addItem(new MenuItem({
                    text: oTab.text,
                    press: this._onMoreItem.bind(this, oTab.key)
                }));
            }.bind(this));

            this._oMenu.openBy(oButton);
        },

        _onMoreItem: function (sKey) {
            this._selectTab(sKey);

            this._sSignature = "";
            this._layoutTabs();
        }

    });
});