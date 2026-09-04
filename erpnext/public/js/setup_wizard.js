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

// 한국표준산업분류(KSIC) 제11차 개정 대분류 21개 — 2024-07-01 시행, 국가데이터처 고시.
// 옵션 값은 명칭이 아니라 대분류 코드(A~U)다. 개정으로 명칭이 바뀌어도 저장된 값과
// industry_modules 매핑이 깨지지 않고, 이후 세세분류·국세청 업종코드로 내려갈 때 그대로
// 조인 키로 쓸 수 있다. 라벨은 "KSIC" 컨텍스트로 번역한다 — 컨텍스트가 없으면
// "Manufacturing" 같은 msgid 가 ERPNext 모듈명 번역("조작")과 충돌한다.
erpnext.setup.ksic_sections = [
	{ value: "A", label: __("Agriculture, forestry and fishing", null, "KSIC") }, // 농업, 임업 및 어업
	{ value: "B", label: __("Mining and quarrying", null, "KSIC") }, // 광업
	{ value: "C", label: __("Manufacturing", null, "KSIC") }, // 제조업
	{ value: "D", label: __("Electricity, gas, steam and air conditioning supply", null, "KSIC") }, // 전기, 가스, 증기 및 공기 조절 공급업
	{ value: "E", label: __("Water supply; sewage, waste management and materials recovery", null, "KSIC") }, // 수도, 하수 및 폐기물 처리, 원료 재생업
	{ value: "F", label: __("Construction", null, "KSIC") }, // 건설업
	{ value: "G", label: __("Wholesale and retail trade", null, "KSIC") }, // 도매 및 소매업
	{ value: "H", label: __("Transportation and storage", null, "KSIC") }, // 운수 및 창고업
	{ value: "I", label: __("Accommodation and food service activities", null, "KSIC") }, // 숙박 및 음식점업
	{ value: "J", label: __("Information and communication", null, "KSIC") }, // 정보통신업
	{ value: "K", label: __("Financial and insurance activities", null, "KSIC") }, // 금융 및 보험업
	{ value: "L", label: __("Real estate activities", null, "KSIC") }, // 부동산업
	{ value: "M", label: __("Professional, scientific and technical activities", null, "KSIC") }, // 전문, 과학 및 기술 서비스업
	{
		value: "N",
		label: __(
			"Business facilities management and business support services; rental and leasing activities",
			null,
			"KSIC"
		),
	}, // 사업시설 관리, 사업 지원 및 임대 서비스업
	{ value: "O", label: __("Public administration and defence; compulsory social security", null, "KSIC") }, // 공공 행정, 국방 및 사회보장 행정
	{ value: "P", label: __("Education", null, "KSIC") }, // 교육 서비스업
	{ value: "Q", label: __("Human health and social work activities", null, "KSIC") }, // 보건업 및 사회복지 서비스업
	{ value: "R", label: __("Arts, sports and recreation related services", null, "KSIC") }, // 예술, 스포츠 및 여가관련 서비스업
	{ value: "S", label: __("Membership organizations, repair and other personal services", null, "KSIC") }, // 협회 및 단체, 수리 및 기타 개인 서비스업
	{
		value: "T",
		label: __(
			"Activities of households as employers; undifferentiated goods- and services-producing activities of households for own use",
			null,
			"KSIC"
		),
	}, // 가구내 고용활동 및 달리 분류되지 않은 자가소비 생산활동
	{ value: "U", label: __("Activities of extraterritorial organizations and bodies", null, "KSIC") }, // 국제 및 외국기관
];

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
				options: [{ value: "", label: "" }].concat(erpnext.setup.ksic_sections),
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
// Keys are KSIC section codes and must match the persona_industry option values.
// Accounting is always on; an unmapped value falls back to accounting only.
erpnext.setup.industry_modules = {
	A: ["accounting", "stock"], // 농업, 임업 및 어업
	B: ["accounting", "stock"], // 광업
	C: ["accounting", "stock", "manufacturing"], // 제조업
	D: ["accounting", "stock"], // 전기, 가스, 증기 및 공기 조절 공급업
	E: ["accounting", "stock"], // 수도, 하수 및 폐기물 처리, 원료 재생업
	F: ["accounting", "stock", "projects"], // 건설업
	G: ["accounting", "stock"], // 도매 및 소매업
	H: ["accounting", "stock"], // 운수 및 창고업
	I: ["accounting", "stock"], // 숙박 및 음식점업
	J: ["accounting", "projects"], // 정보통신업
	K: ["accounting"], // 금융 및 보험업
	L: ["accounting", "projects"], // 부동산업
	M: ["accounting", "projects"], // 전문, 과학 및 기술 서비스업
	N: ["accounting", "projects"], // 사업시설 관리, 사업 지원 및 임대 서비스업
	O: ["accounting", "projects"], // 공공 행정, 국방 및 사회보장 행정
	P: ["accounting", "projects"], // 교육 서비스업
	Q: ["accounting", "stock"], // 보건업 및 사회복지 서비스업
	R: ["accounting", "projects"], // 예술, 스포츠 및 여가관련 서비스업
	S: ["accounting", "stock"], // 협회 및 단체, 수리 및 기타 개인 서비스업
	T: ["accounting"], // 가구내 고용활동 및 달리 분류되지 않은 자가소비 생산활동
	U: ["accounting", "projects"], // 국제 및 외국기관
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
