const isEmail = str => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);

const { createApp } = Vue

createApp({
  delimiters: ['[%', '%]'],
  data() {
    return {
        id: '',
        payment_data: {},
        gateway: '',
        showDiv: false,
        showLoading: false,
        doc: window.doc,
    }
  },
  methods: {
    payWithPaystack(){
        let me = this;
        this.showLoading = true;
        let handler = PaystackPop.setup({
            key: doc.public_key, 
            amount: doc.payment_amount * 100,
            // ref: me.payment_data.name+'_'+Math.floor((Math.random() * 1000000000) + 1), // generates a pseudo-unique reference. Please replace with a reference you generated. Or remove the line entirely so our API will generate one for you
            currency: doc.currency,
            email: doc.email,
            metadata: {
                reference_doctype:doc.reference_doctype,
                reference_docname:doc.reference_docname,
                customer:doc.customer,
                reference:doc.reference,
                email: doc.email
            },
            // label: "Optional string that replaces customer email"
            onClose: function(){
                alert('Payment Terminated.');
            },
            callback: function(response){
                frappe.call({
                    type: "POST",
                    method: "frappe_paystack.api.fecthCustomerAndItemDetails",
                    args:{customer_name: doc.customer, sales_order: doc.reference_docname}
                }).then(async res => {
                    if(res.message.auto_enroll){
                        const attendees = await me.collectAttendees(res);
                        console.log(doc.reference_docname);
                        frappe.call({
                        method: 'frappe_paystack.api.register_and_enrol_moodle_user',
                        args: {
                            "attendees": attendees,
                            "sales_order": doc.reference_docname,
                        }
                        }).then(r => {
                            console.log(r);
                            Swal.fire({
                                title: "Enrolment Successful",
                                text: (r && r.message.message) || "Please use email " + doc.email + " to login into https://training.kartoza.com/my/courses.php.",
                                icon: "success"
                            }).then(() => {
                                window.location.href = '/invoices';
                            });
                            me.showLoading = false;
                        }).catch(err => {
                            try {
                                Swal.fire({
                                    title: "Enrolment Failed",
                                    text: (err && err.message) || "An error occurred while enrolling.",
                                    icon: "error"
                                })
                            } catch (_) {}
                            me.showLoading = false;
                        })
                    }
                    else{
                        Swal.fire(
                            'Successful',
                            'Your payment was successful, we will issue you receipt shortly.',
                            'success'
                        )
                        me.showLoading = false;
                    }
                }).catch(err => {
                    me.showLoading = false;
                });
                $('#paymentBTN').hide();
            }
        });

        handler.openIframe();
    },
    getData(){
        let me = this;
        frappe.call("frappe_paystack.api.validate_payment_link", {"docname": doc.reference}).then(res=>{
            let data = res.message;
            if (data.order_status in ["Completed", "Closed'", "Paid"]) {
                errors = "Paid or Completed"
            } else if (["Processed", "Completed"].includes(data.status)){
                errors = "Payment already processed."
            } else if ([0, 2].includes(data.order_docstatus)) {
                errors = "Payment link expired or invalid."
            } else {
                errors = ""
            }
            if (errors){
                window.location.reload();
            } else {
                if (doc.email){
                    this.payWithPaystack();
                } else {

                    frappe.call({
                        method: 'frappe_paystack.api.get_current_user_email',
                        args: {}
                    }).then(r => {
                        doc.email = r.message.email;
                        me.payWithPaystack();
                    })
                }
            }
        })
    },
    formatCurrency(amount, currency){
        if(currency){
            return Intl.NumberFormat('en-US', {currency:currency, style:'currency'}).format(amount);
        } else {
            return Intl.NumberFormat('en-US').format(amount);
        }
    },
    async collectAttendees(res) {
        let attendees = [];
        for (let i = 0; i < res.message.items.length; i++) {
            let item = res.message.items[i];
            for (let j = 1; j <= item.item_qty; j++) {
                const result = await Swal.fire({
                    title: `Register user(s) for ${item.item_name} (${j}/${item.item_qty})`,
                    html: `
                        <input id="swal-fname" class="swal2-input" placeholder="First Name">
                        <input id="swal-lname" class="swal2-input" placeholder="Last Name">
                        <input id="swal-email" class="swal2-input" placeholder="Email">
                    `,
                    focusConfirm: false,
                    confirmButtonText: 'Save',
                    preConfirm: () => {
                        const first_name = document.getElementById('swal-fname').value;
                        const last_name = document.getElementById('swal-lname').value;
                        const email = document.getElementById('swal-email').value;
                        if (!first_name || !last_name || !email) {
                            Swal.showValidationMessage('All fields are required');
                            return false;
                        }
                        return { first_name, last_name, email };
                    }
                });
                if (result.value) {
                    attendees.push({
                        item_name: item.item_name,
                        course_id: item.custom_moodle_course_id,
                        web_token: item.custom_moodle_web_token,
                        ...result.value
                    });
                }
            }
        }
        return attendees;
    }
  },
  
  mounted(){

  }
}).mount('#app')



document.querySelector("paymentBTN")