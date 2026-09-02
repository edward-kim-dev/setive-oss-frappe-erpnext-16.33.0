frappe.provide("erpnext.setup");

frappe.pages["setup-wizard"].on_page_load = function (wrapper) {
	if (frappe.sys_defaults.company) {
		frappe.set_route("desk");
		return;
	}
};

frappe.provide("frappe.setup.utils");

// frappe.setup.utils 는 코어 setup_wizard.js 에서 통째로 재할당되므로, 이 파일이
// 먼저 평가되면 래핑이 유실된다. setup_wizard_requires 로 주입되는 이 파일은 항상
// 코어 페이지 스크립트 이후에 로드된다는 전제를 지킬 것.
const original_setup_language_field = frappe.setup.utils.setup_language_field;

frappe.setup.utils.setup_language_field = function (slide) {
	// 코어 load_prefilled_data() 는 System Settings 의 언어 "코드"(예: "ko")를
	// frappe.wizard.values.language 에 넣지만, Autocomplete 옵션의 value 는
	// 언어 "라벨명"(예: "한국어")이라 그대로 두면 매칭에 실패한다. 여기서 환산한다.
	const codes_to_names = frappe.setup.data.lang?.codes_to_names || {};
	let val = frappe.wizard?.values?.language;

	if (codes_to_names[val]) {
		val = codes_to_names[val];
	} else if (!val) {
		val = frappe.setup.data.lang?.default_language;
	}

	if (val && frappe.wizard) {
		// 정규화된 라벨명을 되돌려주면 코어가 df.default 와 set_input 을 알아서 처리한다.
		frappe.wizard.values.language = val;
	}

	if (original_setup_language_field) {
		original_setup_language_field.call(this, slide);
	}
};

frappe.setup.on("before_load", function () {
	// 슬라이드가 만들어지기 전에 기본 언어를 심어둔다. default_language 는 서버가
	// System Settings 기준으로 계산해 내려주므로 특정 언어를 하드코딩하지 않는다.
	const welcome_slide = frappe.setup.slides_settings.find((s) => s.name === "welcome");
	if (welcome_slide) {
		const lang_field = welcome_slide.fields?.find((f) => f.fieldname === "language");
		const target_default = frappe.wizard?.values?.language || frappe.setup.data.lang?.default_language;
		if (lang_field && target_default) {
			lang_field.default = target_default;
		}
	}

	if (
		frappe.boot.setup_wizard_completed_apps?.length &&
		frappe.boot.setup_wizard_completed_apps.includes("erpnext")
	) {
		return;
	}

	erpnext.setup.slides_settings.map(frappe.setup.add_slide);
});

erpnext.setup.slides_settings = [
	{
		// Persona — help us tailor the setup
		name: "persona",
		title: __("A little about you"),
		// subtitle shown under the title
		help: __("A few quick questions so we can set things up the way you work."),
		fields: [
			{
				fieldname: "persona_implementing_for",
				label: __("Who are you setting this up for?"),
				fieldtype: "Select",
				options: ["", "My own business", "A company I work for", "A client I'm consulting for"].join(
					"\n"
				),
				reqd: 1,
			},
			{
				fieldname: "persona_company_size",
				label: __("How big is the team?"),
				fieldtype: "Select",
				options: ["", "1–10", "11–50", "51–200", "201–1,000", "1,000+"].join("\n"),
				reqd: 1,
			},
			{
				fieldname: "persona_industry",
				label: __("What kind of work do you do?"),
				fieldtype: "Select",
				options: [
					"",
					"Manufacturing",
					"Retail",
					"Wholesale / Distribution",
					"E-commerce",
					"Services / Consulting",
					"Construction / Real Estate",
					"Technology / Software",
					"Healthcare",
					"Education",
					"Agriculture",
					"Food & Beverage",
					"Non Profit",
					"Other",
				].join("\n"),
				reqd: 1,
			},
			{
				fieldname: "persona_current_system",
				label: __("What do you use today?"),
				fieldtype: "Select",
				options: [
					"",
					"Tally",
					"QuickBooks",
					"Zoho",
					"Sage",
					"SAP",
					"Microsoft Dynamics",
					"Oracle NetSuite",
					"Xero",
					"Excel / Spreadsheets",
					"Nothing yet - starting fresh",
					"Other",
				].join("\n"),
				reqd: 1,
			},
			{
				fieldtype: "Section Break",
				description: __("Select the modules that you plan to implement"),
			},
			{ fieldname: "module_accounting", label: __("Accounting"), fieldtype: "Check" },
			{ fieldname: "module_stock", label: __("Stock"), fieldtype: "Check" },
			{ fieldtype: "Column Break" },
			{ fieldname: "module_manufacturing", label: __("Manufacturing"), fieldtype: "Check" },
			{ fieldname: "module_projects", label: __("Project Management"), fieldtype: "Check" },
		],

		onload: function (slide) {
			this.bind_industry_modules(slide);
		},

		bind_industry_modules: function (slide) {
			let me = this;
			slide.get_input("persona_industry").on("change", function () {
				me.apply_industry_modules(slide);
			});
		},

		apply_industry_modules: function (slide) {
			let industry = slide.get_field("persona_industry").get_value();
			let modules = erpnext.setup.industry_modules[industry] || ["accounting"];
			["accounting", "stock", "manufacturing", "projects"].forEach(function (module) {
				slide.get_field("module_" + module).set_value(modules.includes(module) ? 1 : 0);
			});
		},
	},
	{
		// Organization
		name: "organization",
		title: __("Setup your organization"),
		icon: "fa fa-building",
		fields: [
			{
				fieldname: "company_name",
				label: __("Company Name"),
				fieldtype: "Data",
				reqd: 1,
			},
			{
				fieldname: "company_abbr",
				label: __("Company Abbreviation"),
				fieldtype: "Data",
				reqd: 1,
			},
			{ fieldtype: "Section Break" },
			{
				fieldname: "chart_of_accounts",
				label: __("Chart of Accounts"),
				options: "",
				fieldtype: "Select",
			},
			{ fieldname: "view_coa", label: __("View Chart of Accounts"), fieldtype: "Button" },
			{ fieldname: "fy_start_date", label: __("Financial Year Begins On"), fieldtype: "Date", reqd: 1 },
			// end date should be hidden (auto calculated)
			{ fieldname: "fy_end_date", label: __("End Date"), fieldtype: "Date", reqd: 1, hidden: 1 },
			{ fieldtype: "Section Break" },
			{
				fieldname: "setup_demo",
				label: __("Generate Demo Data for Exploration"),
				fieldtype: "Check",
				description: __(
					"If checked, we will create demo data for you to explore the system. This demo data can be erased later."
				),
			},
		],

		onload: function (slide) {
			this.bind_events(slide);
		},

		before_show: function () {
			this.load_chart_of_accounts(this);
			this.set_fy_dates(this);
		},

		validate: function () {
			if (!this.validate_fy_dates()) {
				return false;
			}

			if ((this.values.company_name || "").toLowerCase() == "company") {
				frappe.msgprint(__("Company Name cannot be Company"));
				return false;
			}
			if (!this.values.company_abbr) {
				return false;
			}
			if (this.values.company_abbr.length > 10) {
				return false;
			}

			return true;
		},

		validate_fy_dates: function () {
			// validate fiscal year start and end dates
			const invalid =
				this.values.fy_start_date == "Invalid date" || this.values.fy_end_date == "Invalid date";
			const start_greater_than_end = this.values.fy_start_date > this.values.fy_end_date;

			if (invalid || start_greater_than_end) {
				frappe.msgprint(__("Please enter valid Financial Year Start and End Dates"));
				return false;
			}

			return true;
		},

		set_fy_dates: function (slide) {
			var country = frappe.wizard.values.country || frappe.defaults.get_default("country");

			if (country) {
				let fy = erpnext.setup.fiscal_years[country];
				let current_year = moment(new Date()).year();
				let next_year = current_year + 1;
				if (!fy) {
					fy = ["01-01", "12-31"];
					next_year = current_year;
				}

				let year_start_date = current_year + "-" + fy[0];
				if (year_start_date > frappe.datetime.get_today()) {
					next_year = current_year;
					current_year -= 1;
				}
				slide.get_field("fy_start_date").set_value(current_year + "-" + fy[0]);
				slide.get_field("fy_end_date").set_value(next_year + "-" + fy[1]);
			}
		},

		load_chart_of_accounts: function (slide) {
			let country = frappe.wizard.values.country || frappe.defaults.get_default("country");

			if (country) {
				frappe.call({
					method: "erpnext.accounts.doctype.account.chart_of_accounts.chart_of_accounts.get_charts_for_country",
					args: { country: country, with_standard: true },
					callback: function (r) {
						if (r.message) {
							slide.get_input("chart_of_accounts").empty().add_options(r.message);
						}
					},
				});
			}
		},

		bind_events: function (slide) {
			let me = this;
			slide.get_input("fy_start_date").on("change", function () {
				var start_date = slide.form.fields_dict.fy_start_date.get_value();
				var year_end_date = frappe.datetime.add_days(frappe.datetime.add_months(start_date, 12), -1);
				slide.form.fields_dict.fy_end_date.set_value(year_end_date);
			});

			slide.get_input("view_coa").on("click", function () {
				let chart_template = slide.form.fields_dict.chart_of_accounts.get_value();
				if (!chart_template) return;

				me.charts_modal(slide, chart_template);
			});

			slide
				.get_input("company_name")
				.on("input", function () {
					let parts = slide.get_input("company_name").val().split(" ");
					let abbr = $.map(parts, function (p) {
						return p ? p.substr(0, 1) : null;
					}).join("");
					slide.get_field("company_abbr").set_value(abbr.slice(0, 10).toUpperCase());
				})
				.val(frappe.boot.sysdefaults.company_name || "")
				.trigger("change");

			slide
				.get_input("company_abbr")
				.on("change", function () {
					let abbr = slide.get_input("company_abbr").val();
					if (abbr.length > 10) {
						frappe.msgprint(__("Company Abbreviation cannot have more than 5 characters"));
						abbr = abbr.slice(0, 10);
					}
					slide.get_field("company_abbr").set_value(abbr);
				})
				.val(frappe.boot.sysdefaults.company_abbr || "")
				.trigger("change");
		},

		charts_modal: function (slide, chart_template) {
			let parent = __("All Accounts");

			let dialog = new frappe.ui.Dialog({
				title: chart_template,
				fields: [
					{
						fieldname: "expand_all",
						label: __("Expand All"),
						fieldtype: "Button",
						click: function () {
							// expand all nodes on button click
							coa_tree.load_children(coa_tree.root_node, true);
						},
					},
					{
						fieldname: "collapse_all",
						label: __("Collapse All"),
						fieldtype: "Button",
						click: function () {
							// collapse all nodes
							coa_tree
								.get_all_nodes(coa_tree.root_node.data.value, coa_tree.root_node.is_root)
								.then((data_list) => {
									data_list.map((d) => {
										coa_tree.toggle_node(coa_tree.nodes[d.parent]);
									});
								});
						},
					},
				],
			});

			// render tree structure in the dialog modal
			let coa_tree = new frappe.ui.Tree({
				parent: $(dialog.body),
				label: parent,
				expandable: true,
				method: "erpnext.accounts.utils.get_coa",
				args: {
					chart: chart_template,
					parent: parent,
					doctype: "Account",
				},
				onclick: function (node) {
					parent = node.value;
				},
			});

			// add class to show buttons side by side
			const form_container = $(dialog.body).find("form");
			const buttons = $(form_container).find(".frappe-control");
			form_container.addClass("flex");
			buttons.map((index, button) => {
				$(button).css({ "margin-right": "1em" });
			});

			dialog.show();
			coa_tree.load_children(coa_tree.root_node, true); // expand all node trigger
		},
	},
];

// Modules pre-selected on the persona slide based on the chosen industry.
// Keys must match the persona_industry option values. Accounting is always on.
erpnext.setup.industry_modules = {
	Manufacturing: ["accounting", "stock", "manufacturing"],
	Retail: ["accounting", "stock"],
	"Wholesale / Distribution": ["accounting", "stock"],
	"E-commerce": ["accounting", "stock"],
	"Services / Consulting": ["accounting", "projects"],
	"Construction / Real Estate": ["accounting", "stock", "projects"],
	"Technology / Software": ["accounting", "projects"],
	Healthcare: ["accounting", "stock"],
	Education: ["accounting", "projects"],
	Agriculture: ["accounting", "stock"],
	"Food & Beverage": ["accounting", "stock", "manufacturing"],
	"Non Profit": ["accounting", "projects"],
	Other: ["accounting"],
};

// Source: https://en.wikipedia.org/wiki/Fiscal_year
// default 1st Jan - 31st Dec

erpnext.setup.fiscal_years = {
	Afghanistan: ["12-21", "12-20"],
	Australia: ["07-01", "06-30"],
	Bangladesh: ["07-01", "06-30"],
	"Costa Rica": ["10-01", "09-30"],
	Egypt: ["07-01", "06-30"],
	Ethiopia: ["07-08", "07-07"],
	"Hong Kong": ["04-01", "03-31"],
	India: ["04-01", "03-31"],
	Iran: ["06-23", "06-22"],
	Kenya: ["07-01", "06-30"],
	Malaysia: ["07-01", "06-30"],
	Myanmar: ["04-01", "03-31"],
	Nepal: ["07-16", "07-15"],
	"New Zealand": ["04-01", "03-31"],
	Pakistan: ["07-01", "06-30"],
	Singapore: ["04-01", "03-31"],
	"South Africa": ["03-01", "02-28"],
	"United Kingdom": ["04-01", "03-31"],
};
