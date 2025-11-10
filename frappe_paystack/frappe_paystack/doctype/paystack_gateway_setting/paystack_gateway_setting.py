# Copyright (c) 2024, Anthony C. Emmanuel and contributors
# For license information, please see license.txt

from urllib.parse import urlencode

import frappe
from frappe import _
from frappe.utils import call_hook_method, get_url
from frappe.model.document import Document

class PaystackGatewaySetting(Document):
	supported_currencies = ['NGN', 'GHS', 'ZAR', 'USD']
	
	def validate(self):
		self.check_enabled()

	def get_secret_key(self):
		return self.get_password('secret_key')

	def check_enabled(self):
		"""
			Ensure only one gateway is enabled for each gate type.
		"""
		if self.enabled:
			enabled_gateway = frappe.db.get_list(self.doctype, filters={
				"enabled":1,
				"company":self.company,
				"name":["!=", self.name]
			},
			fields=["name"])
			if enabled_gateway:
				frappe.throw(f"""
					Another gateway is enabled, disable it before enabling this one.<br>
					<a class="text-danger" href="/app/{self.doctype.lower().replace(' ', '-')}/{enabled_gateway[0].name}">{enabled_gateway[0].name}</a>
				""")
	def validate_transaction_currency(self, currency):
		if currency not in self.supported_currencies:
			frappe.throw(
				_(
					"Please select another payment method. Paystack does not support transactions in currency '{0}'"
				).format(currency)
			)
	
	def get_supported_currency(self):
		return self.supported_currencies
	
	def get_payment_url(self, **kwargs):
		"""
		Create a Paystack Payment Log and return the payment checkout URL.
		Called by Payment Request with parameters like:
		- amount, currency, title, description
		- reference_doctype, reference_docname
		- payer_email, payer_name, order_id
		"""
		# Extract parameters
		amount = kwargs.get("amount", 0)
		currency = kwargs.get("currency", "NGN")
		reference_doctype = kwargs.get("reference_doctype")
		reference_docname = kwargs.get("reference_docname")
		
		# Get the Payment Request to extract the actual order details
		if reference_doctype == "Payment Request" and reference_docname:
			payment_request = frappe.get_doc(reference_doctype, reference_docname)
			# Get the actual order/invoice being paid
			order_doctype = payment_request.reference_doctype
			order_docname = payment_request.reference_name
			
			# Get the order document to extract company
			if frappe.db.exists(order_doctype, order_docname):
				order_doc = frappe.get_doc(order_doctype, order_docname)
				
				# Create Paystack Payment Log
				log = frappe.new_doc("Paystack Payment Log")
				log.company = getattr(order_doc, "company", self.company)
				log.linked_doctype = order_doctype
				log.linked_docname = order_docname
				log.amount = amount
				log.currency = currency
				log.status = "Pending"
				log.insert(ignore_permissions=True)
				frappe.db.commit()
				
				# Return the payment link
				return log.get_payment_link()
		
		# Fallback to old behavior if we can't create a log
		return get_url(f"./paystack-checkout?{urlencode(kwargs)}")


